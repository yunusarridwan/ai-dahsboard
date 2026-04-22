import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

export interface LegalContractFile {
  name: string;
  size: number;
  uploadedAt: string;
  apiPath?: string;
  /** AI analysis detail rows extracted during verify-contract */
  aiDetail?: { Topik: string; Posisi: string; deskripsi: string }[];
  aiStatus?: string;
}

export interface SubmissionLogEntry {
  timestamp: string;
  step: 'verify-api' | 'save-api' | 'local-storage';
  status: 'success' | 'error' | 'info';
  /** Payload sent to verify/save API */
  sentToApi?: { endpoint: string; payload: Record<string, unknown> };
  apiResponse?: unknown;
  savedLocally?: Record<string, unknown>;
  note?: string;
}

export interface ApprovalLogEntry {
  action: string;
  userName: string;
  userRole: string;
  date: string;
  comment: string;
}

export interface UserComment {
  id: string;
  text: string;
  userName: string;
  userRole: string;
  date: string;
  /** Name of the file this comment relates to (null = general contract comment) */
  fileRef?: string;
}

export interface LegalContract {
  contractId: string;
  tipeRequest: string;
  judulKontrak: string;
  customerType: string;
  customer: string;
  relatedPid: string;
  projectCode: string;
  picKontrak1: string;
  spvOtherMember: string;
  projectDec: string;
  pidReference: string;
  noKontrak: string;
  mulaiMasaBerlaku: string;
  selesaiMasaBerlaku: string;
  reminderIn: string;
  noRefVdi: string;
  kodeArsip: string;
  notes: string;
  fileUploads: LegalContractFile[];
  approvalLog: ApprovalLogEntry[];
  submissionLog?: SubmissionLogEntry[];
  userComments?: UserComment[];
  status: string;
  createdAt: string;
}

export const LEGAL_CONTRACT_LS_KEY = 'ai_legal_contracts';

interface ApiContractListItem {
  id: string;
  requestType: string;
  contractTitle: string;
  customerType: string;
  relatePID: string;
  customer: string;
  projectCode: string;
  piC_Contract: string;
  spv: string;
  project_Dec: string;
  piD_Ref: string;
  contract_No: string;
  contract_StartDate: string;
  contract_EndDate: string;
  reminder: string;
  ref_VDI: string;
  archive_Code: string;
  notes: string;
  nameFile: string;
  pathFile: string;
  status: string;
  persentase: string;
  createdAt: string;
}

interface ApiContractListResponse {
  pageNumber: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
  data: ApiContractListItem[];
}

@Component({
  selector: 'app-legal-contract-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './legal-contract-list.component.html',
  styleUrl: './legal-contract-list.component.css'
})
export class LegalContractListComponent implements OnInit {
  private readonly LIST_URL = '/api/contractAI/getlist';

  contracts: LegalContract[] = [];
  filtered: LegalContract[] = [];
  searchQuery = '';
  currentPage = 1;
  readonly pageSize = 10;

  totalRecords = 0;
  serverTotalPages = 1;
  isLoading = false;
  loadError = '';

  get isUser(): boolean { return this.auth.userRole() === 'user'; }

  get totalContract(): number { return this.totalRecords; }
  get onGoing(): number {
    return this.contracts.filter(c => !['Accepted', 'Close'].includes(c.status)).length;
  }
  get acceptedAndClose(): number {
    return this.contracts.filter(c => ['Accepted', 'Close'].includes(c.status)).length;
  }
  get totalPages(): number {
    if (this.searchQuery.trim()) return 1;
    return Math.max(1, this.serverTotalPages);
  }
  get pagedItems(): LegalContract[] {
    if (this.searchQuery.trim()) return this.filtered;
    return this.contracts;
  }
  get showingStart(): number {
    if (this.searchQuery.trim()) return this.filtered.length ? 1 : 0;
    return this.contracts.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }
  get showingEnd(): number {
    if (this.searchQuery.trim()) return this.filtered.length;
    return this.showingStart === 0 ? 0 : this.showingStart + this.contracts.length - 1;
  }
  get totalShownCount(): number {
    return this.searchQuery.trim() ? this.filtered.length : this.totalRecords;
  }
  get pageNumbers(): number[] {
    if (this.totalPages <= 7) return Array.from({ length: this.totalPages }, (_, i) => i + 1);
    const p = this.currentPage, pages: number[] = [1];
    if (p > 3) pages.push(-1);
    for (let i = Math.max(2, p - 1); i <= Math.min(this.totalPages - 1, p + 1); i++) pages.push(i);
    if (p < this.totalPages - 2) pages.push(-1);
    pages.push(this.totalPages);
    return pages;
  }

  constructor(private router: Router, private http: HttpClient, public auth: AuthService) {}

  ngOnInit(): void { this.loadContracts(); }

  private sortContractsByDate(items: LegalContract[]): LegalContract[] {
    return [...items].sort((a, b) => this.getCreatedAtTimestamp(b.createdAt) - this.getCreatedAtTimestamp(a.createdAt));
  }

  private getCreatedAtTimestamp(value: string): number {
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? 0 : ts;
  }

  loadContracts(pageNumber = this.currentPage): void {
    this.isLoading = true;
    this.loadError = '';
    const safePage = Math.max(1, pageNumber);
    const url = `${this.LIST_URL}?pageNumber=${safePage}&pageSize=${this.pageSize}`;
    const headers = new HttpHeaders({
      Accept: 'application/json',
      'ngrok-skip-browser-warning': 'true',
    });

    this.http.get(url, { responseType: 'text', headers }).subscribe({
      next: (raw: string) => {
        const parsed = this.parseListResponse(raw);
        if (!parsed) {
          this.contracts = [];
          this.filtered = [];
          this.totalRecords = 0;
          this.serverTotalPages = 1;
          this.loadError = 'API returned non-JSON response for getlist.';
          console.error('[LegalContractList] getlist parse failed', raw?.slice(0, 300));
          this.isLoading = false;
          return;
        }

        const res = parsed;
        const items = Array.isArray(res?.data) ? res.data : [];
        console.info('[LegalContractList] getlist response', {
          pageNumber: res?.pageNumber,
          pageSize: res?.pageSize,
          totalRecords: res?.totalRecords,
          totalPages: res?.totalPages,
          dataCount: items.length,
        });
        this.currentPage = Number(res?.pageNumber) || safePage;
        this.totalRecords = Number(res?.totalRecords) || 0;
        this.serverTotalPages = Math.max(1, Number(res?.totalPages) || 1);
        this.contracts = this.sortContractsByDate(items.map((item) => this.mapApiItemToContract(item)));
        this.syncContractsToLocalStorage(this.contracts);
        this.applyFilter();
        this.isLoading = false;
      },
      error: (err: unknown) => {
        this.contracts = [];
        this.filtered = [];
        this.totalRecords = 0;
        this.serverTotalPages = 1;
        this.loadError = 'Failed to load contracts from API. Please check proxy/CORS or backend availability.';
        console.error('[LegalContractList] getlist failed', err);
        this.isLoading = false;
      },
    });
  }

  private parseListResponse(raw: string): ApiContractListResponse | null {
    const text = (raw ?? '').trim().replace(/^\uFEFF/, '');
    if (!text) return null;

    const direct = this.tryParseJson(text);
    if (direct) return direct;

    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first < 0 || last <= first) return null;

    return this.tryParseJson(text.slice(first, last + 1));
  }

  private tryParseJson(text: string): ApiContractListResponse | null {
    try {
      const parsed = JSON.parse(text) as ApiContractListResponse;
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data)) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  private mapApiItemToContract(item: ApiContractListItem): LegalContract {
    const fileUploads: LegalContractFile[] = item.nameFile
      ? [{
          name: item.nameFile,
          size: 0,
          uploadedAt: item.createdAt || new Date().toISOString(),
          apiPath: item.pathFile || '',
          aiDetail: [],
          aiStatus: item.status || '',
        }]
      : [];

    return {
      contractId: item.id,
      tipeRequest: item.requestType || '-',
      judulKontrak: item.contractTitle || item.nameFile || '-',
      customerType: item.customerType || '',
      customer: item.customer || '-',
      relatedPid: item.relatePID || '',
      projectCode: item.projectCode || '-',
      picKontrak1: item.piC_Contract || '-',
      spvOtherMember: item.spv || '-',
      projectDec: item.project_Dec || '',
      pidReference: item.piD_Ref || '',
      noKontrak: item.contract_No || '',
      mulaiMasaBerlaku: item.contract_StartDate || '',
      selesaiMasaBerlaku: item.contract_EndDate || '',
      reminderIn: item.reminder || '',
      noRefVdi: item.ref_VDI || '',
      kodeArsip: item.archive_Code || '',
      notes: item.notes || '',
      fileUploads,
      approvalLog: [],
      submissionLog: [],
      userComments: [],
      status: item.status || 'Submitted',
      createdAt: item.createdAt || new Date().toISOString(),
    };
  }

  private syncContractsToLocalStorage(apiContracts: LegalContract[]): void {
    try {
      const raw = localStorage.getItem(LEGAL_CONTRACT_LS_KEY);
      const existing: LegalContract[] = raw ? JSON.parse(raw) : [];
      const map = new Map(existing.map((c) => [c.contractId, c]));
      for (const c of apiContracts) {
        const prev = map.get(c.contractId);
        map.set(c.contractId, prev ? { ...prev, ...c } : c);
      }
      localStorage.setItem(LEGAL_CONTRACT_LS_KEY, JSON.stringify(this.sortContractsByDate(Array.from(map.values()))));
    } catch {}
  }

  applyFilter(): void {
    const q = this.searchQuery.toLowerCase().trim();
    const results = !q ? [...this.contracts] : this.contracts.filter(c =>
      c.judulKontrak.toLowerCase().includes(q) ||
      c.customer.toLowerCase().includes(q) ||
      c.projectCode.toLowerCase().includes(q) ||
      c.contractId.toLowerCase().includes(q) ||
      c.tipeRequest.toLowerCase().includes(q)
    );
    this.filtered = this.sortContractsByDate(results);
  }

  onPageSizeChange(): void {}

  goPage(n: number): void {
    if (n < 1 || n > this.totalPages || n === this.currentPage) return;
    this.currentPage = n;
    this.loadContracts(this.currentPage);
  }

  createNew(): void { this.router.navigate(['/legal-contract/create']); }

  viewDetail(contract: LegalContract): void {
    this.router.navigate(['/legal-contract', encodeURIComponent(contract.contractId)]);
  }

  viewPreview(contract: LegalContract): void {
    this.router.navigate(['/legal-contract', encodeURIComponent(contract.contractId), 'preview']);
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Accepted': return 'badge-accepted';
      case 'Submitted': return 'badge-submitted';
      case 'Submit Draft': return 'badge-draft';
      case 'Submit Revision': return 'badge-revision';
      case 'Review': return 'badge-review';
      default: return 'badge-default';
    }
  }
}
