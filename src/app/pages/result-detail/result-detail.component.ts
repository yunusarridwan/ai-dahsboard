import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';

interface PercentageItem {
  id:         string;
  ticketno:   string;
  createdby:  string;
  comparedon: string;
}

interface PagedResponse {
  pageNumber:   number;
  pageSize:     number;
  totalRecords: number;
  totalPages:   number;
  data:         PercentageItem[];
}

interface ScoreConfig {
  color:   string;
  bgLight: string;
  badgeBg: string;
  image:   string;
}

@Component({
  selector: 'app-result-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './result-detail.component.html',
  styleUrl: './result-detail.component.css'
})
export class ResultDetailComponent implements OnInit {
  score   = '';
  color   = '';
  bgLight = '';
  badgeBg = '';
  image   = '';

  // Current page data (from server)
  documents:    PercentageItem[] = [];
  totalRecords  = 0;
  totalPages    = 0;
  currentPage   = 1;
  readonly pageSize = 10;

  isLoading = true;
  hasError  = false;

  private readonly scoreConfig: Record<string, ScoreConfig> = {
    '0':   { color: '#EF4444', bgLight: '#FEF2F2', badgeBg: 'rgba(239,68,68,0.12)',   image: 'assets/images/Icon 0 Result.png'   },
    '20':  { color: '#F97316', bgLight: '#FFF7ED', badgeBg: 'rgba(249,115,22,0.12)',  image: 'assets/images/Icon 20 Result.png'  },
    '40':  { color: '#EAB308', bgLight: '#FEFCE8', badgeBg: 'rgba(234,179,8,0.12)',   image: 'assets/images/Icon 40 Result.png'  },
    '60':  { color: '#22C55E', bgLight: '#F0FDF4', badgeBg: 'rgba(34,197,94,0.12)',   image: 'assets/images/Icon 60 Result.png'  },
    '80':  { color: '#10B981', bgLight: '#ECFDF5', badgeBg: 'rgba(16,185,129,0.12)',  image: 'assets/images/Icon 80 Result.png'  },
    '100': { color: '#059669', bgLight: '#D1FAE5', badgeBg: 'rgba(5,150,105,0.12)',   image: 'assets/images/Icon 100 Result.png' },
  };

  constructor(private route: ActivatedRoute, private http: HttpClient) {}

  ngOnInit(): void {
    this.score = this.route.snapshot.paramMap.get('score') ?? '0';
    const cfg = this.scoreConfig[this.score] ?? this.scoreConfig['0'];
    this.color   = cfg.color;
    this.bgLight = cfg.bgLight;
    this.badgeBg = cfg.badgeBg;
    this.image   = cfg.image;

    const bucketKey = `bucket${this.score}` as
      'bucket0' | 'bucket20' | 'bucket40' | 'bucket60' | 'bucket80' | 'bucket100';

    interface ResultRow {
      id: string; createdAt: string;
      bucket0: number; bucket20: number; bucket40: number;
      bucket60: number; bucket80: number; bucket100: number;
    }

    this.http.get<{ success: boolean; data: ResultRow }>('/api/WOD/result')
      .subscribe({
        next: (res) => {
          if (!res?.success || !res.data) return;

          // API returns a single object
          this.totalRecords = res.data[bucketKey] ?? 0;
        }
      });

    this.fetchPage(1);
  }

  // ── Pagination helpers ────────────────────────────────────────────────────

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

  // ── Data fetching ──────────────────────────────────────────────────────────

  private apiUrl(page: number): string {
    return `/api/WOD/getby-percentage?percentage=${this.score}&pagenum=${page}&pagesize=${this.pageSize}`;
  }

  fetchPage(page: number): void {
    const url  = this.apiUrl(page);
    this.isLoading = true;
    this.hasError  = false;

    this.http.get<PagedResponse>(url).subscribe({
      next: (res) => {
        this.documents    = res.data ?? [];
        this.totalRecords = res.totalRecords;
        this.totalPages   = res.totalPages;
        this.currentPage  = res.pageNumber;
        this.isLoading    = false;
      },
      error: (err: unknown) => {
        console.error('[WOD] getby-percentage error:', err);
        this.isLoading = false;
        this.hasError  = true;
      }
    });
  }

  fetchList(): void {
    this.fetchPage(this.currentPage);
  }

  forceRefresh(): void {
    this.fetchPage(1);
  }
}
