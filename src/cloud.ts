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
  /** New data; a full render follows. */
  show(cards: CloudCard[], catalog: CloudCard[]): void;
  /** One variant's quantities changed: only its results need updating. */
  changed(cards: CloudCard[], id: string): void;
  clear(): void;
  render(): void;
  /** Only the lock state changed. */
  lock(): void;
  status(message: string, error?: boolean): void;
}
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
// The page shows the sign-in screen or the collection from this attribute ('loading' until Auth answers).
const showSession = (state: 'signed-in' | 'signed-out') => { document.body.dataset.session = state; };

class CloudController {
  mode: 'signed-out' | 'loading' | 'cloud' = 'loading';
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
    element('btnCloudRefresh').addEventListener('click', () => { void this.refresh(true); });
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
    element('accountLabel').textContent = session?.user.email ?? '';
    element('authSignedIn').hidden = !session;
    showSession(session ? 'signed-in' : 'signed-out');
    this.message('');
    setTimeout(() => {
      if (generation !== this.generation) return;
      if (nextId) {
        this.repository = new CloudRepository(accountClient(nextId), nextId);
        this.mode = 'cloud';
        void this.refresh();
      } else {
        this.mode = 'signed-out';
        this.bridge.render();
        this.bridge.status('');
      }
    }, 0);
  }

  /** Tab returns and recovery reads fetch only the collection; the reload button also fetches the catalog. */
  async refresh(reloadCatalog = false): Promise<void> {
    const repository = this.repository, generation = this.generation;
    if (!repository || this.busy) return;
    this.busy = true; this.ready = false; this.bridge.lock();
    this.bridge.status('Loading online collection…');
    try {
      const cards = await repository.load(reloadCatalog);
      if (generation !== this.generation) return;
      this.catalog = repository.catalog;
      this.bridge.show(cards, repository.catalog);
      this.ready = true;
      this.bridge.status('Online collection loaded · Supabase');
    } catch {
      if (generation !== this.generation) return;
      this.bridge.status('Couldn’t load the online collection. Editing is locked. Reload or sign out.', true);
    } finally {
      if (generation === this.generation) { this.busy = false; this.bridge.render(); }
    }
  }

  editToken(id: string, language: string): string { return `${this.generation}:${this.repository?.revision(id, language) ?? 'new'}`; }

  async change(id: string, language: string, edit: Partial<Edit> | { finish: 'normal' | 'foil'; delta: number }, token?: string): Promise<boolean> {
    if (this.mode !== 'cloud' || this.locked || !this.repository) return false;
    if (token !== undefined && token !== this.editToken(id, language)) {
      this.bridge.status('The collection was reloaded in the meantime. Close the dialog and edit the current values again.', true);
      return false;
    }
    const repository = this.repository, generation = this.generation;
    let reloaded = false;
    this.busy = true; this.bridge.lock(); this.bridge.status('Saving online…');
    try {
      if ('finish' in edit) await repository.adjust(id, language, edit.finish, edit.delta);
      else await repository.edit(id, language, edit);
      if (generation !== this.generation) return false;
      this.bridge.changed(repository.cards(), id);
      this.bridge.status('Saved · Supabase');
      return true;
    } catch {
      if (generation !== this.generation) return false;
      // Read after any uncertain response; never replay an increment or overwrite a conflict.
      this.ready = false; reloaded = true;
      try {
        const cards = await repository.load();
        if (generation !== this.generation) return false;
        this.bridge.show(cards, repository.catalog);
        this.ready = true;
        this.bridge.status('Change not confirmed, or another device changed this card. Loaded the current server state; check your counts.', true);
      } catch {
        if (generation !== this.generation) return false;
        this.bridge.status('Connection lost. Saving is locked. Reload and check your counts.', true);
      }
      return false;
    } finally {
      if (generation === this.generation) { this.busy = false; if (reloaded) this.bridge.render(); else this.bridge.lock(); }
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
    this.setAuthBusy(true); this.message(signUp ? 'Creating account…' : 'Signing in…');
    try {
      const credentials = { email: element<HTMLInputElement>('authEmail').value.trim(), password: element<HTMLInputElement>('authPassword').value };
      const { data, error } = signUp
        ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: location.origin + location.pathname } })
        : await client.auth.signInWithPassword(credentials);
      element<HTMLInputElement>('authPassword').value = '';
      if (error) throw error;
      if (signUp && !data.session) this.message('Confirm your email address, then sign in. If no email arrives, email delivery must be set up in Supabase.');
    } catch {
      this.message('Sign-in or registration failed. Check your credentials, email confirmation and connection.');
    } finally { this.setAuthBusy(false); }
  }
  private async signOut(): Promise<void> {
    if (this.authBusy) return;
    this.setAuthBusy(true);
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch { this.bridge.status('Sign-out failed. Check your connection and try again.', true); }
    finally { this.setAuthBusy(false); }
  }
}

declare global { interface Window { RiftboundCloud: { start(bridge: Bridge): CloudController | null } } }
window.RiftboundCloud = { start: bridge => {
  if (location.protocol === 'file:') {
    element('authForm').hidden = true;
    element('authStatus').textContent = 'Open the tracker over HTTP or HTTPS to sign in.';
    showSession('signed-out');
    return null;
  }
  return new CloudController(bridge);
} };
