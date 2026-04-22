import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  username = '';
  password = '';
  showPassword = signal(false);
  errorMsg  = signal('');
  loading   = signal(false);

  constructor(private auth: AuthService, private router: Router) {}

  togglePassword(): void {
    this.showPassword.update(v => !v);
  }

  async onSubmit(): Promise<void> {
    this.errorMsg.set('');
    if (!this.username.trim() || !this.password) {
      this.errorMsg.set('Please enter your username and password.');
      return;
    }

    this.loading.set(true);
    // Simulate async delay for UX polish
    await new Promise(r => setTimeout(r, 600));

    const success = await this.auth.login(this.username, this.password);
    this.loading.set(false);

    if (success) {
      this.router.navigate(['/dashboard']);
    } else {
      this.errorMsg.set('Invalid username or password. Please try again.');
    }
  }

  readonly hints = [
    { role: 'User',     username: 'user',     password: 'user123'     },
    { role: 'Reviewer', username: 'reviewer', password: 'reviewer123' },
  ];
}
