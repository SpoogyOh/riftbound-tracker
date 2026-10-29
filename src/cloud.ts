import { createClient, type Session } from '@supabase/supabase-js';
import type { Database } from '../types/database.generated.js';
import { CloudRepository, type CloudCard, type Edit } from './cloud-repository.js';

// Publishable browser key. Database grants and RLS enforce access, never this key's secrecy.
const url = 'https://jhleumwhywdurherakml.supabase.co';
const publishableKey = 'sb_publishable_zqTzJfGCjqW5ldztrOoMIw_akdfXUP7';
const client = createClient<Database>(url, publishableKey);

// Bind each repository request to its owner, even if another tab switches accounts mid-request.
function accountClient(userId: string) {
  return createClient<Database>(url, publishableKey, { accessToken: async () => {
    const { data, error } = await client.auth.getSession();
    if (error || data.session?.user.id !== userId) throw new Error('The signed-in account changed.');
    return data.session.access_token;
  } });
}

interface Bridge {
  show(cards: CloudCard[], catalog: CloudCard[]): void;
  local(isCurrent: () => boolean): Promise<void>;
  clear(): void;
  render(): void;
  status(message: string, error?: boolean): void;
}
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

class CloudController {
  mode: 'local' | 'loading' | 'cloud' = 'loading';
  busy = false;
  ready = false;
  catalog: CloudCard[] | null = null;
  private generation = 0;
  private userId: string | null | undefined;
  private repository: CloudRepository | null = null;
  private authBusy = false;
  constructor(private bridge: Bridge) {
    element('authForm').addEventListener('submit', event => { event.preventDefault(); void this.authenticate(false); });
    element('btnSignUp').addEventListener('click', () => { void this.authenticate(true); });
    element('btnSignOut').addEventListener('click', () => { void this.signOut(); });
    element('btnCloudRefresh').addEventListener('click', () => { void this.refresh(); });
    // Schedule API work outside the Auth callback to avoid holding the session lock.
    client.auth.onAuthStateChange((_event, session) => { this.sessionChanged(session); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.mode === 'cloud' && this.ready && !this.busy) void this.refresh();
    });
    this.bridge.render();
  }
  get locked(): boolean { return this.mode === 'loading' || this.busy || !this.ready; }

  private sessionChanged(session: Session | null): void {
    const nextId = session?.user.id ?? null;
    if (this.userId === nextId) return;
    this.userId = nextId;
    const generation = ++this.generation;
    this.mode = 'loading'; this.ready = false; this.busy = false;
    this.catalog = null; this.repository = null;
    // Clear old account data immediately, including while the next request is pending.
    this.bridge.clear();
    element('authAccount').textContent = session?.user.email ?? '';
    element('authForm').hidden = !!session;
    element('authSignedIn').hidden = !session;
    setTimeout(() => {
      if (generation !== this.generation) return;
      if (nextId) {
        this.repository = new CloudRepository(accountClient(nextId), nextId);
        this.mode = 'cloud';
        void this.refresh();
      } else {
        void this.restoreLocal(generation);
      }
    }, 0);
  }

  private async restoreLocal(generation: number): Promise<void> {
    await this.bridge.local(() => generation === this.generation);
    if (generation !== this.generation) return;
    this.mode = 'local'; this.ready = true;
    this.bridge.render();
    this.message('Lokale Sammlung · nur in diesem Browser gespeichert.');
  }

  async refresh(): Promise<void> {
    const repository = this.repository, generation = this.generation;
    if (!repository || this.busy) return;
    this.busy = true; this.ready = false; this.bridge.render();
    this.bridge.status('Online-Sammlung wird geladen …');
    try {
      const cards = await repository.load();
      if (generation !== this.generation) return;
      this.catalog = repository.catalog;
      this.bridge.show(cards, repository.catalog);
      this.ready = true;
      this.bridge.status('Online-Sammlung geladen · Supabase');
      this.message('Online-Sammlung · Änderungen werden direkt gespeichert. Lokale Bestände bleiben separat erhalten; eigene Karten und Backup-Import bleiben lokal.');
    } catch {
      if (generation !== this.generation) return;
      this.bridge.status('Online-Sammlung konnte nicht geladen werden. Bearbeiten ist gesperrt. Bitte erneut laden oder abmelden.', true);
    } finally {
      if (generation === this.generation) { this.busy = false; this.bridge.render(); }
    }
  }

  editToken(id: string): string { return `${this.generation}:${this.repository?.revision(id) ?? 'new'}`; }

  async change(id: string, edit: Partial<Edit> | { finish: 'normal' | 'foil'; delta: number }, token?: string): Promise<boolean> {
    if (this.mode !== 'cloud' || this.locked || !this.repository) return false;
    if (token !== undefined && token !== this.editToken(id)) {
      this.bridge.status('Der Bestand wurde inzwischen neu geladen. Bitte den Dialog schließen und die aktuellen Werte erneut bearbeiten.', true);
      return false;
    }
    const repository = this.repository, generation = this.generation;
    this.busy = true; this.bridge.render(); this.bridge.status('Wird online gespeichert …');
    try {
      if ('finish' in edit) await repository.adjust(id, edit.finish, edit.delta);
      else await repository.edit(id, edit);
      if (generation !== this.generation) return false;
      this.bridge.show(repository.cards(), repository.catalog);
      this.bridge.status('Gespeichert · Supabase');
      return true;
    } catch {
      if (generation !== this.generation) return false;
      // Read after any uncertain response; never replay an increment or overwrite a conflict.
      this.ready = false;
      try {
        this.bridge.show(await repository.load(), repository.catalog);
        this.ready = true;
        this.bridge.status('Änderung nicht bestätigt oder Konflikt mit einem anderen Gerät. Aktueller Serverstand geladen; bitte Bestand prüfen.', true);
      } catch {
        this.bridge.status('Verbindung unterbrochen. Speichern ist gesperrt. Bitte neu laden und Bestand prüfen.', true);
      }
      return false;
    } finally {
      if (generation === this.generation) { this.busy = false; this.bridge.render(); }
    }
  }

  private message(message: string): void { element('authStatus').textContent = message; }
  private setAuthBusy(value: boolean): void {
    this.authBusy = value;
    for (const id of ['btnSignIn', 'btnSignUp', 'btnSignOut']) element<HTMLButtonElement>(id).disabled = value;
  }
  private async authenticate(signUp: boolean): Promise<void> {
    const form = element<HTMLFormElement>('authForm');
    if (this.authBusy || !form.reportValidity()) return;
    this.setAuthBusy(true); this.message(signUp ? 'Konto wird erstellt …' : 'Anmeldung läuft …');
    try {
      const credentials = { email: element<HTMLInputElement>('authEmail').value.trim(), password: element<HTMLInputElement>('authPassword').value };
      const { data, error } = signUp
        ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: location.origin + location.pathname } })
        : await client.auth.signInWithPassword(credentials);
      element<HTMLInputElement>('authPassword').value = '';
      if (error) throw error;
      if (signUp && !data.session) this.message('Bitte bestätige deine E-Mail-Adresse und melde dich anschließend an. Falls keine Mail ankommt, muss der E-Mail-Versand in Supabase eingerichtet werden.');
    } catch {
      this.message('Anmeldung oder Registrierung fehlgeschlagen. Bitte Zugangsdaten, E-Mail-Bestätigung und Verbindung prüfen.');
    } finally { this.setAuthBusy(false); }
  }
  private async signOut(): Promise<void> {
    if (this.authBusy) return;
    this.setAuthBusy(true);
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch { this.message('Abmelden fehlgeschlagen. Bitte Verbindung prüfen und erneut versuchen.'); }
    finally { this.setAuthBusy(false); }
  }
}

declare global { interface Window { RiftboundCloud: { start(bridge: Bridge): CloudController | null } } }
window.RiftboundCloud = { start: bridge => {
  if (location.protocol === 'file:') {
    element('authForm').hidden = true;
    element('authStatus').textContent = 'Lokaler Dateimodus. Für die Online-Sammlung den Tracker über HTTP oder HTTPS öffnen.';
    return null;
  }
  return new CloudController(bridge);
} };
