import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LayoutService } from '../../layout/layout.service';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './search-bar.component.html'
})
export class SearchBarComponent {
  query = '';
  constructor(public layoutService: LayoutService) {}

  onSend(): void {
    if (this.query.trim()) {
      console.log('Search:', this.query);
      this.query = '';
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.onSend();
  }
}
