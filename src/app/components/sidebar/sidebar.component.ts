import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LayoutService } from '../../layout/layout.service';
import { AuthService } from '../../services/auth.service';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  iconImg: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  constructor(public layoutService: LayoutService, public authService: AuthService) {}

  logout(): void {
    this.layoutService.close();
    this.authService.logout();
  }

  navGroups: NavGroup[] = [
    {
      group: 'AI MENU',
      items: [
        { label: 'AI for document validation',    route: '/dashboard',             icon: 'validation', iconImg: 'assets/Icon/file-attachment-black.png' },
        { label: 'AI for document comparison',    route: '/comparison',            icon: 'comparison', iconImg: 'assets/Icon/columns-01.png'            },
        { label: 'AI Contract Verification',      route: '/contract-verification', icon: 'contract',   iconImg: 'assets/Icon/check-circle-broken.png'   },
        { label: 'Legal Contract',                route: '/legal-contract',        icon: 'legal',      iconImg: 'assets/Icon/file-attachment-black.png' },
      ]
    },
    {
      group: 'SETTINGS',
      items: [
        { label: 'Settings', route: '/settings', icon: 'settings', iconImg: 'assets/Icon/vuesax/linear/setting-2.png' },
        { label: 'Logout',   route: '/logout',   icon: 'logout',   iconImg: 'assets/Icon/vuesax/linear/logout.png'    },
      ]
    }
  ];

  mainNav     = this.navGroups[0].items;
  settingsNav = this.navGroups[1].items;
}
