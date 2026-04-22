import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

export type UserRole = 'user' | 'reviewer';

export interface AuthUser {
  username: string;
  name: string;
  role: UserRole;
}

interface DummyUser extends AuthUser {
  password: string;
}

const DUMMY_USERS: DummyUser[] = [
  { username: 'user', password: 'user123', name: 'John User', role: 'user' },
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

  async login(username: string, password: string): Promise<boolean> {
    const normalizedUsername = username.trim();
    const user = DUMMY_USERS.find(
      (u) => u.username === normalizedUsername && u.password === password
    );

    if (!user) {
      return false;
    }

    const { password: _ignored, ...authUser } = user;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    this._currentUser.set(authUser);
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
