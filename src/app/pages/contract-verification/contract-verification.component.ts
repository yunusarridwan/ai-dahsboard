import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

interface DetailItem {
  Topik: string;
  Posisi: string;
  deskripsi: string;
}

interface VerifyModel {
  status: string;
  ringkasan: string;
  persentase: string;
  detail: DetailItem[];
}

interface VerifyResponse {
  status:   boolean;
  filepath?: string;
  model:    VerifyModel;
}

interface ApiError {
  code: string;
  message: string;
}

interface ContractDetailRecord {
  id:          string;
  nameFile:    string;
  pathFile?:   string;
  status:      string;
  persentase:  string;
  createdAt:   string;
  data:        VerifyModel;  // already a parsed object from the API
}

@Component({
  selector: 'app-contract-verification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './contract-verification.component.html',
  styleUrl: './contract-verification.component.css'
})
export class ContractVerificationComponent implements OnInit, OnDestroy {
  private readonly API_URL  = '/api/contractAI/verify-contract';
  private readonly SAVE_URL  = '/api/contractAI/save';

  readonly requestTypeOptions = ['New', 'Review'];
  readonly customerTypeOptions = ['Customer', 'Vendor', 'Others'];
  readonly relatedPidOptions = ['Project', 'Non Project'];
  readonly customerOptions = [
    'BANK NOBU NASIONAL',
    'BANK CAPITAL',
    'BANK MAYAPADA',
  ];
  readonly projectCodeOptions = ['PRJ9A2K7M11', 'PRJ8B4L2X09', 'PRJ7Z1Q5N33'];
  readonly picKontrakOptions = ['Joko Sunyoto', 'Rina Paramita', 'Dimas Saputra'];
  readonly spvMemberOptions = ['Hendra Saputra', 'Maya Putri Lestari', 'Rafli Wijaya'];

  selectedRequestType = this.requestTypeOptions[1];
  selectedCustomerType = this.customerTypeOptions[0];
  selectedRelatedPid = this.relatedPidOptions[0];

  selectedFile: File | null = null;
  isDragOver   = false;
  isLoading    = false;
  result: VerifyResponse | null = null;
  errorMessage = '';          // file-validation errors
  apiError: ApiError | null = null;  // API call errors

  /** History (read-only) mode — activated when ?historyId= is present */
  historyMode     = false;
  historyFileName = '';
  historyFilePath = '';
  historyRecordId = '';
  historyLoading  = false;

  /** Save success toast */
  saveToast = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  retryCountdown = 0;
  retryTotal     = 10;
  private retryTimer?: ReturnType<typeof setInterval>;

  constructor(
    private http:  HttpClient,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const historyId = this.route.snapshot.queryParamMap.get('historyId');
    if (!historyId) return;

    this.historyMode      = true;
    this.historyRecordId  = historyId;
    this.historyLoading   = true;
    console.log(`%c[ContractAI] 📂 Loading history id=${historyId}`, 'color:#6366F1;font-weight:bold');

    this.http.get<ContractDetailRecord>(`/api/contractAI/getbyid?id=${historyId}`).subscribe({
      next: (rec) => {
        this.historyFileName = rec.nameFile;
        this.historyFilePath = rec.pathFile ?? '';
        this.result = { status: true, model: rec.data };
        console.log('%c[ContractAI] ✅ History loaded:', 'color:#10B981;font-weight:bold', this.result);
        this.historyLoading = false;
      },
      error: (err) => {
        console.error('[ContractAI] Failed to fetch history:', err);
        this.historyLoading = false;
        this.historyMode    = false;   // fall back to normal upload mode
      },
    });
  }

  ngOnDestroy(): void {
    this.cancelRetry();
    clearTimeout(this.toastTimer);
  }

  /* ── File selection ─────────────────────────────────────────── */

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.setFile(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(): void {
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    const file = event.dataTransfer?.files[0];
    if (file) this.setFile(file);
  }

  private setFile(file: File): void {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.type)) {
      this.errorMessage = 'Only PDF, DOC, or DOCX files are allowed.';
      return;
    }
    this.selectedFile = file;
    this.errorMessage = '';
    this.result = null;
  }

  clearFile(): void {
    this.selectedFile = null;
    this.result       = null;
    this.errorMessage = '';
    this.apiError     = null;
    this.cancelRetry();
  }

  formatSize(bytes: number): string {
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  selectCustomerType(option: string): void {
    this.selectedCustomerType = option;
  }

  selectRelatedPid(option: string): void {
    this.selectedRelatedPid = option;
  }

  /* ── API call ───────────────────────────────────────────────── */

  verifyContract(): void {
    if (!this.selectedFile || this.isLoading) return;

    this.isLoading    = true;
    this.errorMessage = '';
    this.apiError     = null;
    this.result       = null;
    this.cancelRetry();

    const formData = new FormData();
    formData.append('file', this.selectedFile);

    console.log('%c[ContractAI] 🚀 Verifying contract...', 'color:#0D9488;font-weight:bold');
    console.time('[ContractAI] Request duration');

    this.http.post<VerifyResponse>(this.API_URL, formData).subscribe({
      next: (res) => {
        console.timeEnd('[ContractAI] Request duration');
        console.log('%c[ContractAI] ✅ Response:', 'color:#10B981;font-weight:bold', res);
        this.isLoading = false;
        this.result    = res;
        this.saveResult(res);
      },
      error: (err) => {
        console.timeEnd('[ContractAI] Request duration');
        console.error('%c[ContractAI] ❌ Error:', 'color:#EF4444;font-weight:bold', err);
        this.isLoading = false;
        this.apiError  = {
          code:    err.status === 0   ? 'Network Error'
                 : err.status === 404 ? '404 Not Found'
                 : err.status === 500 ? '500 Internal Server Error'
                 : err.status === 503 ? '503 Service Unavailable'
                 : `Error ${err.status || 'Unknown'}`,
          message: err.status === 0   ? 'Cannot reach the server. Please check your network connection.'
                 : err.status === 404 ? 'Verification endpoint not found. Please contact your administrator.'
                 : err.status === 500 ? 'The AI service encountered an internal error. Please try again.'
                 : err.status === 503 ? 'The AI service is temporarily unavailable. Please try again later.'
                 : 'Verification failed. Please try again.',
        };
        this.startRetryCountdown(10);
      }
    });
  }

  /* ── Save result to backend ────────────────────────────────── */

  private saveResult(res: VerifyResponse): void {
    if (!this.selectedFile) return;

    // Calculate percentage the same way the FE getter does
    const detail = res.model?.detail ?? [];
    const total  = detail.length;
    const found  = total > 0
      ? detail.filter(d => !this.isNotFound(d.Posisi)).length
      : 0;
    const pct = total > 0 ? Math.round((found / total) * 100) : 0;

    const body = {
      nameFile:   this.selectedFile.name,
      pathFile:   res.filepath ?? '',
      status:     res.model?.status ?? '',
      persentase: pct,
      data:       JSON.stringify(res.model),
    };

    console.log('%c[ContractAI] 💾 Saving result...', 'color:#6366F1;font-weight:bold', body);

    this.http.post(this.SAVE_URL, body).subscribe({
      next: (saved) => {
        console.log('%c[ContractAI] ✅ Saved:', 'color:#10B981;font-weight:bold', saved);
        this.showSaveToast();
      },
      error: (err)  => console.warn('%c[ContractAI] ⚠️ Save failed (non-blocking):', 'color:#F59E0B;font-weight:bold', err),
    });
  }

  /* ── Retry logic ──────────────────────────────────────────────── */

  startRetryCountdown(seconds: number): void {
    this.retryTotal     = seconds;
    this.retryCountdown = seconds;
    clearInterval(this.retryTimer);
    this.retryTimer = setInterval(() => {
      this.retryCountdown--;
      if (this.retryCountdown <= 0) {
        clearInterval(this.retryTimer);
        this.retryCountdown = 0;
        this.verifyContract();
      }
    }, 1000);
  }

  retryNow(): void {
    this.cancelRetry();
    this.verifyContract();
  }

  cancelRetry(): void {
    clearInterval(this.retryTimer);
    this.retryCountdown = 0;
  }

  /** stroke-dashoffset for countdown ring (r=32, circ≈201.06) */
  getCountdownOffset(): number {
    const circ = 2 * Math.PI * 32;
    if (this.retryTotal <= 0) return 0;
    return circ * (1 - this.retryCountdown / this.retryTotal);
  }

  /* ── Helpers ────────────────────────────────────────────────── */

  get percentage(): number {
    const total = this.result?.model?.detail?.length ?? 0;
    if (total === 0) return 0;
    const found = this.result!.model.detail.filter(d => !this.isNotFound(d.Posisi)).length;
    return Math.round((found / total) * 100);
  }

  get validClauses(): DetailItem[] {
    return this.result?.model?.detail?.filter(d => !this.isNotFound(d.Posisi)) ?? [];
  }

  get invalidClauses(): DetailItem[] {
    return this.result?.model?.detail?.filter(d => this.isNotFound(d.Posisi)) ?? [];
  }

  get isValid(): boolean {
    return this.percentage === 100;
  }

  /** 100=SAFE (green) | >=75=WARNING (orange) | <75=CRITICAL (red) */
  get statusColor(): string {
    const p = this.percentage;
    if (p === 100) return '#10B981'; // green  – safe
    if (p >= 75)   return '#F97316'; // orange – warning
    return '#EF4444';               // red    – critical
  }

  get riskLevel(): string {
    const p = this.percentage;
    if (p === 100) return 'SAFE';
    if (p >= 75)   return 'WARNING';
    return 'CRITICAL';
  }

  get statusBgClass(): string {
    return this.isValid ? 'bg-emerald-500' : 'bg-red-500';
  }

  /** SVG circle stroke-dasharray for percentage gauge (r=50, circ≈314.16) */
  getCircleDash(pct: number): string {
    const circ   = 2 * Math.PI * 50;
    const filled = (pct / 100) * circ;
    return `${filled.toFixed(2)} ${(circ - filled).toFixed(2)}`;
  }

  countFound(): number {
    return this.result?.model?.detail?.filter(d => !this.isNotFound(d.Posisi)).length ?? 0;
  }

  countMissing(): number {
    return this.result?.model?.detail?.filter(d => this.isNotFound(d.Posisi)).length ?? 0;
  }

  isNotFound(posisi: string): boolean {
    return posisi?.toLowerCase().includes('tidak ditemukan');
  }

  showSaveToast(): void {
    clearTimeout(this.toastTimer);
    this.saveToast = true;
    this.toastTimer = setTimeout(() => { this.saveToast = false; }, 4000);
  }

  dismissToast(): void {
    clearTimeout(this.toastTimer);
    this.saveToast = false;
  }

  isDownloading = false;

  downloadOriginal(): void {
    if (!this.historyRecordId || this.isDownloading) return;
    this.isDownloading = true;
    this.http.get(`/api/contractAI/download?id=${this.historyRecordId}`, { responseType: 'blob', observe: 'response' }).subscribe({
      next: (res) => {
        const blob = res.body!;
        const cd = res.headers.get('content-disposition') ?? '';
        const match = cd.match(/filename[^;=\n]*=([^;\n]*)/);
        const fileName = match ? match[1].replace(/["']/g, '').trim() : this.historyFileName || 'document';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        this.isDownloading = false;
      },
      error: (err) => {
        console.error('[ContractAI] Download failed:', err);
        this.isDownloading = false;
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/comparison/verification-history']);
  }

  /** Color class pair for Posisi badge */
  posisiBadge(posisi: string): { bg: string; text: string } {
    return this.isNotFound(posisi)
      ? { bg: 'bg-red-100',   text: 'text-red-600'   }
      : { bg: 'bg-teal-100',  text: 'text-teal-700'  };
  }
}
