import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { ContractVerificationComponent } from '../contract-verification/contract-verification.component';

interface ContractListItem {
  id:          string;
  nameFile:    string;
  pathFile?:   string | null;
  status:      string;
  persentase:  string | null;
  createdAt:   string;
}

interface ContractListResponse {
  pageNumber:   number;
  pageSize:     number;
  totalRecords: number;
  totalPages:   number;
  data:         ContractListItem[];
}

@Component({
  selector: 'app-contract-list',
  standalone: true,
  imports: [CommonModule, ContractVerificationComponent],
  templateUrl: './contract-list.component.html',
  styleUrl: './contract-list.component.css'
})
export class ContractListComponent implements OnInit {
  historyId: string | null = null;
  items:        ContractListItem[] = [];
  totalRecords  = 0;
  totalPages    = 0;
  currentPage   = 1;
  readonly pageSize = 10;

  isLoading = true;
  hasError  = false;
  sortCol: 'nameFile' | 'status' | 'persentase' | 'createdAt' = 'createdAt';
  sortDir: 'asc' | 'desc' = 'desc';

  constructor(private http: HttpClient, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.historyId = params.get('historyId');
      if (!this.historyId) {
        this.fetchPage(1);
      }
    });
  }

  // ── Pagination helpers ──────────────────────────────────────────────────

  get showingStart(): number {
    return this.totalRecords === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get showingEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalRecords);
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const p = this.currentPage;
    const pages: number[] = [1];
    if (p > 3) pages.push(-1);
    for (let i = Math.max(2, p - 1); i <= Math.min(total - 1, p + 1); i++) pages.push(i);
    if (p < total - 2) pages.push(-1);
    pages.push(total);
    return pages;
  }

  goPage(n: number): void {
    if (n < 1 || n > this.totalPages || n === this.currentPage) return;
    this.fetchPage(n);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** 100=SAFE (green) | >=75=WARNING (orange) | <75=CRITICAL (red) */
  riskColor(pct: number): string {
    if (pct === 100) return '#10B981';
    if (pct >= 75)   return '#F97316';
    return '#EF4444';
  }

  riskBg(pct: number): string {
    if (pct === 100) return 'rgba(16,185,129,0.12)';
    if (pct >= 75)   return 'rgba(249,115,22,0.12)';
    return 'rgba(239,68,68,0.12)';
  }

  riskLabel(pct: number): string {
    if (pct === 100) return 'SAFE';
    if (pct >= 75)   return 'WARNING';
    return 'CRITICAL';
  }

  statusColor(item: ContractListItem): string { return this.riskColor(this.parsePct(item.persentase)); }
  statusBg(item: ContractListItem): string    { return this.riskBg(this.parsePct(item.persentase)); }
  pctColor(pct: number): string               { return this.riskColor(pct); }
  pctBg(pct: number): string                  { return this.riskBg(pct); }

  parsePct(raw: string | null): number {
    return parseInt(raw ?? '0', 10) || 0;
  }

  formatDate(raw: string): string {
    if (!raw) return '—';
    try {
      const d = new Date(raw);
      return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return raw;
    }
  }

  private sortItems(): void {
    this.items = [...this.items].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;
      switch (this.sortCol) {
        case 'nameFile':
          valA = a.nameFile?.toLowerCase() ?? '';
          valB = b.nameFile?.toLowerCase() ?? '';
          break;
        case 'status':
          valA = a.status?.toLowerCase() ?? '';
          valB = b.status?.toLowerCase() ?? '';
          break;
        case 'persentase':
          valA = this.parsePct(a.persentase);
          valB = this.parsePct(b.persentase);
          break;
        default: // createdAt
          valA = new Date(a.createdAt).getTime();
          valB = new Date(b.createdAt).getTime();
      }
      if (valA < valB) return this.sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  toggleSort(col: 'nameFile' | 'status' | 'persentase' | 'createdAt'): void {
    if (this.sortCol === col) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortCol = col;
      this.sortDir = col === 'createdAt' ? 'desc' : 'asc';
    }
    this.sortItems();
  }

  goToDetail(id: string): void {
    this.router.navigate(['/comparison/verification-history'], { queryParams: { historyId: id } });
  }

  downloadingId: string | null = null;

  downloadFile(item: ContractListItem): void {
    if (this.downloadingId === item.id) return;   // prevent double-click
    this.downloadingId = item.id;
    this.http.get(`/api/contractAI/download?id=${item.id}`, { responseType: 'blob', observe: 'response' }).subscribe({
      next: (res) => {
        const blob = res.body!;
        // Try to grab filename from content-disposition header
        const cd = res.headers.get('content-disposition') ?? '';
        const match = cd.match(/filename[^;=\n]*=([^;\n]*)/);
        const fileName = match ? match[1].replace(/["']/g, '').trim() : item.nameFile || 'document';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        this.downloadingId = null;
      },
      error: (err) => {
        console.error('[ContractAI] Download failed:', err);
        this.downloadingId = null;
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/comparison']);
  }

  // ── Data fetching ────────────────────────────────────────────────────────

  fetchPage(page: number): void {
    const url = `/api/contractAI/getlist?pageNumber=${page}&pageSize=${this.pageSize}`;
    this.isLoading = true;
    this.hasError  = false;

    this.http.get<ContractListResponse>(url).subscribe({
      next: (res) => {
        this.items        = res.data;
        this.totalRecords = res.totalRecords;
        this.totalPages   = res.totalPages;
        this.currentPage  = res.pageNumber;
        this.sortItems();
        this.isLoading    = false;
      },
      error: (err) => {
        console.error('[ContractAI] getlist error:', err);
        this.isLoading = false;
        this.hasError  = true;
      }
    });
  }

  fetchList(): void {
    this.fetchPage(this.currentPage);
  }
}
