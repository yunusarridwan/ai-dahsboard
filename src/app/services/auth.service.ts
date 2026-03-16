import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';

export type UserRole = 'user' | 'reviewer';

export interface AuthUser {
  username: string;
  name: string;
  role: UserRole;
}

interface DummyUser {
  username: string;
  password: string;
  name: string;
  role: UserRole;
}

const DUMMY_USERS: DummyUser[] = [
  { username: 'user',     password: 'user123',     name: 'John User',     role: 'user'     },
  { username: 'reviewer', password: 'reviewer123', name: 'Jane Reviewer', role: 'reviewer' },
];

const STORAGE_KEY = 'ai_dashboard_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _currentUser = signal<AuthUser | null>(this._loadFromStorage());

  readonly currentUser = this._currentUser.asReadonly();
  readonly isLoggedIn  = computed(() => this._currentUser() !== null);
  readonly userRole    = computed(() => this._currentUser()?.role ?? null);

  constructor(private router: Router) {}

  login(username: string, password: string): boolean {
    const match = DUMMY_USERS.find(
      u => u.username === username.trim() && u.password === password
    );
    if (!match) return false;

    const user: AuthUser = { username: match.username, name: match.name, role: match.role };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    this._currentUser.set(user);
    return true;
  }

  logout(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    this._currentUser.set(null);
    this.router.navigate(['/login']);
  }

  private _loadFromStorage(): AuthUser | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }
}
