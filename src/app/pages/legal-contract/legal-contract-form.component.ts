import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { FileStorageService } from '../../services/file-storage.service';
import {
  LegalContract, LegalContractFile, ApprovalLogEntry, SubmissionLogEntry,
  LEGAL_CONTRACT_LS_KEY
} from './legal-contract-list.component';

interface VerifyModel {
  judul?: string;
  no_kontrak?: string;
  berlaku_kontrak?: string;
  selesai_kontrak?: string;
  status: string;
  ringkasan: string;
  persentase: string;
  detail?: VerifyDetailItem[];
}

interface VerifyDetailItem {
  Topik: string;
  Posisi: string;
  deskripsi: string;
}

interface VerifyResponse {
  status:    boolean;
  filepath?: string;
  model?:    VerifyModel | string;
}

type StagedStatus = 'pending' | 'verifying' | 'verified' | 'error';

interface StagedFile {
  file: File;
  status: StagedStatus;
  note?: string;
  verified?: LegalContractFile;
  verifyModel?: VerifyModel;
  verifyRawModel?: Record<string, unknown>;
}

interface SaveContractRequest {
  requestType: string;
  contractTitle: string;
  customerType: number;
  relatePID: number;
  customer: string;
  projectCode: string;
  piC_Contract: string;
  spv: string;
  project_Dec: string;
  piD_Ref: string;
  contract_No: string;
  contract_StartDate: string;
  contract_EndDate: string;
  reminder: number;
  ref_VDI: string;
  archive_Code: string;
  notes: string;
  nameFile: string;
  pathFile: string;
  status: string;
  persentase: number;
  data: string;
}

function generateContractId(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) code += letters.charAt(Math.floor(Math.random() * letters.length));
  const digit = Math.floor(Math.random() * 10);
  const year = new Date().getFullYear();
  return `${num} ${code}${digit}/C/O/${year}`;
}

@Component({
  selector: 'app-legal-contract-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './legal-contract-form.component.html',
  styleUrl: './legal-contract-form.component.css'
})
export class LegalContractFormComponent implements OnInit, OnDestroy {
  private readonly VERIFY_URL = '/api/contractAI/verify-contract';
  private readonly SAVE_URL = '/api/contractAI/save';

  isCreateMode = true;
  contractId   = '';

  // Form fields
  tipeRequest        = 'Review';
  judulKontrak       = '';
  customerType       = 'Customer';
  relatedPid         = 'Project';
  customer           = '';
  projectCode        = '';
  picKontrak1        = '';
  spvOtherMember     = '';
  projectDec         = '';
  pidReference       = '';
  noKontrak          = '';
  mulaiMasaBerlaku   = '';
  selesaiMasaBerlaku = '';
  reminderIn         = 'No Reminder';
  noRefVdi           = '';
  kodeArsip          = '';
  notes              = '';

  /** Files loaded from localStorage (already processed in a previous session) */
  uploadedFiles: LegalContractFile[] = [];
  /** Files staged locally and verified immediately after selection */
  localFiles: StagedFile[] = [];

  isDragOver   = false;
  uploadError  = '';

  // Approval log
  approvalLog: ApprovalLogEntry[] = [];

  // Submit state
  isSaving        = false;
  saveSuccess     = false;
  formError       = '';
  submitProgress  = '';
  lastSubmitLog: SubmissionLogEntry[] = [];

  private savedCreatedAt = '';
  private savedStatus    = 'Submitted';
  private toastTimer?: ReturnType<typeof setTimeout>;

  // Dropdown options
  readonly tipeRequestOptions  = ['New', 'Review'];
  readonly customerTypeOptions = ['Customer', 'Vendor', 'Others'];
  readonly relatedPidOptions   = ['Project', 'Non Project'];
  readonly reminderOptions     = ['60 Hari', '90 Hari', 'No Reminder'];
  readonly customerOptions     = [
    'BANK NOBU NASIONAL', 'BANK CAPITAL', 'BANK MAYAPADA',
    'PT LIPPO GROUP', 'PT ARTHA GRAHA', 'PT GLOBAL NUSANTARA'
  ];
  readonly projectCodeOptions  = [
    'PRJ9A2K7M11', 'PRJ8B4L2X09', 'PRJ7Z1Q5N33', 'PRJ6D5M8K22', 'PRJ5C3N1Q44'
  ];
  readonly picKontrak1Options  = [
    'Joko Sunyoto', 'Rina Paramita', 'Dimas Saputra', 'Andi Wijaya', 'Siti Rahmawati'
  ];
  readonly spvMemberOptions    = [
    'Hendra Saputra', 'Maya Putri Lestari', 'Rafli Wijaya', 'Yuni Astuti', 'Tika Maharani'
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private http: HttpClient,
    private auth: AuthService,
    private fileStorage: FileStorageService
  ) {}

  ngOnInit(): void {
    // Reviewers must not access the edit/submit form
    if (this.auth.userRole() === 'reviewer') {
      this.router.navigate(['/legal-contract']);
      return;
    }
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'create') {
      this.isCreateMode = false;
      this.contractId   = decodeURIComponent(id);
      this.loadExisting();
    } else {
      this.contractId = generateContractId();
    }
  }

  ngOnDestroy(): void { clearTimeout(this.toastTimer); }

  private loadExisting(): void {
    try {
      const raw = localStorage.getItem(LEGAL_CONTRACT_LS_KEY);
      const contracts: LegalContract[] = raw ? JSON.parse(raw) : [];
      const found = contracts.find(c => c.contractId === this.contractId);
      if (!found) return;
      this.tipeRequest        = found.tipeRequest;
      this.judulKontrak       = found.judulKontrak;
      this.customerType       = found.customerType;
      this.relatedPid         = found.relatedPid;
      this.customer           = found.customer;
      this.projectCode        = found.projectCode;
      this.picKontrak1        = found.picKontrak1;
      this.spvOtherMember     = found.spvOtherMember;
      this.projectDec         = found.projectDec;
      this.pidReference       = found.pidReference;
      this.noKontrak          = found.noKontrak;
      this.mulaiMasaBerlaku   = found.mulaiMasaBerlaku;
      this.selesaiMasaBerlaku = found.selesaiMasaBerlaku;
      this.reminderIn         = found.reminderIn;
      this.noRefVdi           = found.noRefVdi;
      this.kodeArsip          = found.kodeArsip;
      this.notes              = found.notes;
      this.uploadedFiles      = found.fileUploads ?? [];
      this.approvalLog        = found.approvalLog ?? [];
      this.savedCreatedAt     = found.createdAt;
      this.savedStatus        = found.status;
    } catch {}
  }

  goBack(): void { this.router.navigate(['/legal-contract']); }

  // ── File handling (local staging only — API called on Submit) ─

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      Array.from(input.files).forEach(f => this.stageFile(f));
      input.value = '';
    }
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); this.isDragOver = true; }
  onDragLeave(): void { this.isDragOver = false; }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    if (event.dataTransfer?.files) {
      Array.from(event.dataTransfer.files).forEach(f => this.stageFile(f));
    }
  }

  private stageFile(file: File): void {
    const allowedExt = ['.pdf', '.doc', '.docx'];
    if (!allowedExt.some(e => file.name.toLowerCase().endsWith(e))) {
      this.uploadError = 'Only PDF, DOC, or DOCX files are allowed.';
      return;
    }
    if (this.localFiles.some(s => s.file.name === file.name) || this.uploadedFiles.some(s => s.name === file.name)) return;
    this.uploadError = '';
    const staged: StagedFile = {
      file,
      status: 'pending',
      note: 'Pending verification',
    };
    this.localFiles.push(staged);

    // Persist the raw file to IndexedDB so the preview can render it even
    // when the server path is not yet accessible.
    this.fileStorage.saveFile(this.contractId, file).catch(() => {});

    // Verify immediately after file selection.
    this.verifyStagedFile(staged);
  }

  removeStagedFile(index: number): void { this.localFiles.splice(index, 1); }
  removeUploadedFile(index: number): void { this.uploadedFiles.splice(index, 1); }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getFileIcon(name: string): 'pdf' | 'word' | 'other' {
    if (name.toLowerCase().endsWith('.pdf')) return 'pdf';
    if (name.toLowerCase().endsWith('.doc') || name.toLowerCase().endsWith('.docx')) return 'word';
    return 'other';
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // ── Submit: verify → localStorage ────────────────────────────

  cancel(): void { this.router.navigate(['/legal-contract']); }

  submit(): void {
    this.formError      = '';
    this.submitProgress = '';
    this.lastSubmitLog  = [];
    if (!this.judulKontrak.trim()) {
      this.formError = 'Judul Kontrak is required.';
      return;
    }

    if (this.localFiles.some(s => s.status === 'pending' || s.status === 'verifying')) {
      this.formError = 'Please wait until file verification is finished.';
      return;
    }

    this.isSaving = true;
    this.finalizeSubmit();
  }

  private verifyStagedFile(staged: StagedFile): void {
    staged.status = 'verifying';
    staged.note   = 'Verifying with AI service...';

    const file = staged.file;
    const formData = new FormData();
    formData.append('file', file);   // ← ONLY the document is sent to the API

    this.http.post<VerifyResponse | string>(this.VERIFY_URL, formData, { responseType: 'json' as const }).subscribe({
      next: (res) => {
        const payload = this.toObjectPayload(res);
        const directModel = this.directModel(payload);
        const rawModel = this.extractRawModel(payload);

        // Hard direct mapping for API shape: { model: { judul, no_kontrak, berlaku_kontrak, selesai_kontrak, ringkasan } }
        if (directModel.judul) this.judulKontrak = directModel.judul;
        if (directModel.ringkasan) this.projectDec = directModel.ringkasan;
        if (directModel.no_kontrak) this.noKontrak = directModel.no_kontrak;
        if (directModel.berlaku_kontrak) this.mulaiMasaBerlaku = directModel.berlaku_kontrak;
        if (directModel.selesai_kontrak) this.selesaiMasaBerlaku = directModel.selesai_kontrak;

        const model = this.extractVerifyModel(payload);
        const detail = this.extractVerifyDetail(payload);
        const apiPath = this.extractFilePath(payload);
        const pct = this.parsePersentase(model.persentase);
        staged.verifyModel = model;
        staged.verifyRawModel = rawModel;

        // Map API response into contract form fields as requested.
        let mappedCount = 0;
        const judulFromFile = this.prettyTitleFromPath(apiPath || file.name);
        const judulVal = model.judul?.trim() || judulFromFile;
        if (judulVal) { this.judulKontrak = judulVal; mappedCount++; }
        if (model.ringkasan?.trim()) { this.projectDec = model.ringkasan.trim(); mappedCount++; }
        const noKontrakVal =
          model.no_kontrak?.trim() ||
          this.extractNoKontrakFromText(model.ringkasan) ||
          this.extractNoKontrakFromText(judulVal);
        if (noKontrakVal) { this.noKontrak = noKontrakVal; mappedCount++; }
        const mulaiVal = model.berlaku_kontrak?.trim() || this.extractTanggalFromText(model.ringkasan, 'start');
        if (mulaiVal) { this.mulaiMasaBerlaku = mulaiVal; mappedCount++; }
        const selesaiVal = model.selesai_kontrak?.trim() || this.extractTanggalFromText(model.ringkasan, 'end');
        if (selesaiVal) { this.selesaiMasaBerlaku = selesaiVal; mappedCount++; }

        // Keep fields populated even when backend does not provide these keys.
        if (!this.noKontrak.trim()) this.noKontrak = 'Tidak tersedia dari hasil AI';
        if (!this.mulaiMasaBerlaku.trim()) this.mulaiMasaBerlaku = 'Tidak tersedia dari hasil AI';
        if (!this.selesaiMasaBerlaku.trim()) this.selesaiMasaBerlaku = 'Tidak tersedia dari hasil AI';

        staged.verified = {
          name      : file.name,
          size      : file.size,
          uploadedAt: new Date().toISOString(),
          apiPath   : apiPath,
          // Keep detail for preview findings panel. This does not auto-fill notes.
          aiDetail  : detail,
          aiStatus  : model.status ?? '',
        };
        staged.status = 'verified';
        staged.note   = mappedCount > 0
          ? `Verified (${pct}%)`
          : `Verified (no mapped fields from response, ${pct}%)`;
      },
      error: (err) => {
        staged.status = 'error';
        staged.note   = `Verify failed: ${err?.message ?? 'unknown error'}`;
      },
    });
  }

  private toObjectPayload(res: unknown): Record<string, unknown> {
    const parsed = this.parseMaybeJson(res);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  }

  private directModel(payload: Record<string, unknown>): {
    judul: string;
    ringkasan: string;
    no_kontrak: string;
    berlaku_kontrak: string;
    selesai_kontrak: string;
  } {
    const m = payload['model'];
    const obj = (m && typeof m === 'object' && !Array.isArray(m)) ? m as Record<string, unknown> : {};
    return {
      judul: typeof obj['judul'] === 'string' ? obj['judul'].trim() : '',
      ringkasan: typeof obj['ringkasan'] === 'string' ? obj['ringkasan'].trim() : '',
      no_kontrak: typeof obj['no_kontrak'] === 'string' ? obj['no_kontrak'].trim() : '',
      berlaku_kontrak: typeof obj['berlaku_kontrak'] === 'string' ? obj['berlaku_kontrak'].trim() : '',
      selesai_kontrak: typeof obj['selesai_kontrak'] === 'string' ? obj['selesai_kontrak'].trim() : '',
    };
  }

  private extractVerifyModel(payload: Record<string, unknown>): VerifyModel {
    const root = payload ?? {};
    const maybeModel =
      root['model'] ??
      (root['data'] as Record<string, unknown> | undefined)?.['model'] ??
      root['data'] ??
      root['result'] ??
      {};

    const parsed = this.parseMaybeJson(maybeModel);
    const obj = (parsed && typeof parsed === 'object')
      ? parsed as Record<string, unknown>
      : {};

    // Some backends return fields at root level instead of inside model.
    const merged: Record<string, unknown> = { ...root, ...obj };

    return {
      judul: this.pickString(merged, ['judul', 'title', 'nama_kontrak', 'judul_kontrak', 'judul kontrak']),
      no_kontrak: this.pickString(merged, ['no_kontrak', 'noKontrak', 'nomor_kontrak', 'no kontrak', 'nomor kontrak']),
      berlaku_kontrak: this.pickString(merged, ['berlaku_kontrak', 'berlakuKontrak', 'mulai_kontrak', 'mulai masa berlaku', 'mulai_masa_berlaku']),
      selesai_kontrak: this.pickString(merged, ['selesai_kontrak', 'selesaiKontrak', 'akhir_kontrak', 'selesai masa berlaku', 'selesai_masa_berlaku']),
      status: this.pickString(merged, ['status']),
      ringkasan: this.pickString(merged, ['ringkasan', 'summary']),
      persentase: this.pickString(merged, ['persentase', 'percentage']),
      detail: this.extractVerifyDetail(payload),
    };
  }

  private extractRawModel(payload: Record<string, unknown>): Record<string, unknown> {
    const root = payload ?? {};
    const maybeModel =
      root['model'] ??
      (root['data'] as Record<string, unknown> | undefined)?.['model'] ??
      root['data'] ??
      {};

    const parsed = this.parseMaybeJson(maybeModel);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  }

  private extractVerifyDetail(payload: Record<string, unknown>): VerifyDetailItem[] {
    const root = payload ?? {};
    const parsedModel = this.parseMaybeJson(root['model']);
    const parsedData = this.parseMaybeJson(root['data']);

    const candidates: unknown[] = [
      root['detail'],
      (parsedModel as Record<string, unknown> | undefined)?.['detail'],
      (parsedData as Record<string, unknown> | undefined)?.['detail'],
      (root['model'] as Record<string, unknown> | undefined)?.['detail'],
      (root['data'] as Record<string, unknown> | undefined)?.['detail'],
      ((root['data'] as Record<string, unknown> | undefined)?.['model'] as Record<string, unknown> | undefined)?.['detail'],
    ];

    for (const c of candidates) {
      const parsed = this.parseMaybeJson(c);
      if (!Array.isArray(parsed)) continue;

      const normalized = parsed
        .map((row) => this.normalizeDetailItem(row))
        .filter((row): row is VerifyDetailItem => !!row);

      if (normalized.length) return normalized;
    }

    return [];
  }

  private normalizeDetailItem(raw: unknown): VerifyDetailItem | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const obj = raw as Record<string, unknown>;

    const topik = this.pickString(obj, ['Topik', 'topik', 'topic']);
    const posisi = this.pickString(obj, ['Posisi', 'posisi', 'position']);
    const deskripsi = this.pickString(obj, ['deskripsi', 'Deskripsi', 'description']);

    if (!topik && !posisi && !deskripsi) return null;

    return {
      Topik: topik,
      Posisi: posisi,
      deskripsi,
    };
  }

  private extractFilePath(payload: Record<string, unknown>): string {
    const fp = payload['filepath']
      ?? payload['filePath']
      ?? (payload['data'] as Record<string, unknown> | undefined)?.['filepath']
      ?? (payload['data'] as Record<string, unknown> | undefined)?.['filePath'];
    return typeof fp === 'string' ? fp : '';
  }

  private parseMaybeJson(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const s = value.trim();
    if (!s) return {};
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  }

  private pickString(obj: Record<string, unknown>, keys: string[]): string {
    // 1) Exact key lookup
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }

    // 2) Normalized key lookup (case-insensitive, ignores spaces/_/-)
    const normalizedMap = new Map<string, string>();
    for (const existingKey of Object.keys(obj)) {
      normalizedMap.set(this.normalizeKey(existingKey), existingKey);
    }
    for (const k of keys) {
      const foundKey = normalizedMap.get(this.normalizeKey(k));
      if (!foundKey) continue;
      const v = obj[foundKey];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }

    return '';
  }

  private normalizeKey(s: string): string {
    return (s ?? '').toLowerCase().replace(/[\s_\-]/g, '');
  }

  private parsePersentase(raw: string): number {
    if (!raw) return 0;
    const cleaned = raw.replace('%', '').replace(',', '.').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  private prettyTitleFromPath(pathOrFile: string): string {
    if (!pathOrFile) return '';
    const fileName = pathOrFile.split('\\').pop()?.split('/').pop() ?? pathOrFile;
    const noExt = fileName.replace(/\.[^.]+$/, '');
    return noExt
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^\d+\s*/, '')
      .trim();
  }

  private extractNoKontrakFromText(text: string): string {
    if (!text) return '';
    const m = text.match(/\b[A-Z0-9]{1,6}\/[A-Z0-9-]{1,20}\/[A-Z]{1,8}\/[0-9]{4}\b/i);
    return m?.[0]?.trim() ?? '';
  }

  private extractTanggalFromText(text: string, mode: 'start' | 'end'): string {
    if (!text) return '';
    const normalized = text.replace(/\s+/g, ' ').trim();
    const allDates = normalized.match(/\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/g);
    if (!allDates?.length) return '';
    return mode === 'start' ? allDates[0] : allDates[allDates.length - 1];
  }

  private finalizeSubmit(): void {
    const log: SubmissionLogEntry[] = [];
    const verified = this.localFiles.filter(s => s.status === 'verified' && s.verified).map(s => s.verified as LegalContractFile);

    for (const s of this.localFiles) {
      log.push({
        timestamp : new Date().toISOString(),
        step      : 'verify-api',
        status    : s.status === 'verified' ? 'success' : (s.status === 'error' ? 'error' : 'info'),
        sentToApi : {
          endpoint: this.VERIFY_URL,
          payload : { file: s.file.name },
        },
        apiResponse: s.verified ? { aiStatus: s.verified.aiStatus } : undefined,
        note: s.note,
      });
    }

    const allFiles = [...this.uploadedFiles, ...verified];
    const payload = this.buildSavePayload(allFiles);
    this.submitProgress = 'Saving contract to API...';

    this.http.post(this.SAVE_URL, payload).subscribe({
      next: (res) => {
        log.push({
          timestamp: new Date().toISOString(),
          step: 'save-api',
          status: 'success',
          sentToApi: {
            endpoint: this.SAVE_URL,
            payload: { ...payload },
          },
          apiResponse: res,
          note: 'Contract data sent to save API.',
        });

        this.localFiles = [];
        this.lastSubmitLog = log;
        this.persistContract(allFiles, log);
      },
      error: (err) => {
        log.push({
          timestamp: new Date().toISOString(),
          step: 'save-api',
          status: 'error',
          sentToApi: {
            endpoint: this.SAVE_URL,
            payload: { ...payload },
          },
          apiResponse: err,
          note: 'Failed to save contract to API.',
        });

        this.lastSubmitLog = log;
        this.isSaving = false;
        this.submitProgress = '';
        this.formError = 'Failed to save contract to API. Please try again.';
      },
    });
  }

  private buildSavePayload(allFiles: LegalContractFile[]): SaveContractRequest {
    const firstFile = allFiles[0];
    const firstVerifiedStage = this.localFiles.find(s => s.status === 'verified' && s.verifyModel);
    const firstVerified = firstVerifiedStage?.verifyModel;
    const contractStartDate = this.toIsoDateTime(this.mulaiMasaBerlaku);
    const contractEndDate = this.toIsoDateTime(this.selesaiMasaBerlaku);
    const status = firstVerified?.status?.trim() || firstFile?.aiStatus || this.savedStatus || 'Submitted';
    const persentase = firstVerified ? this.parsePersentase(firstVerified.persentase) : 0;
    const dataPayload = this.buildDataPayload(firstVerifiedStage);

    return {
      requestType: this.tipeRequest,
      contractTitle: this.judulKontrak,
      customerType: this.mapCustomerTypeToInt(this.customerType),
      relatePID: this.mapRelatedPidToInt(this.relatedPid),
      customer: this.customer,
      projectCode: this.projectCode,
      piC_Contract: this.picKontrak1,
      spv: this.spvOtherMember,
      project_Dec: this.projectDec,
      piD_Ref: this.pidReference,
      contract_No: this.noKontrak,
      contract_StartDate: contractStartDate,
      contract_EndDate: contractEndDate,
      reminder: this.mapReminderToInt(this.reminderIn),
      ref_VDI: this.noRefVdi,
      archive_Code: this.kodeArsip,
      notes: this.notes,
      nameFile: firstFile?.name ?? '',
      pathFile: firstFile?.apiPath ?? '',
      status,
      persentase,
      data: JSON.stringify(dataPayload),
    };
  }

  private buildDataPayload(stage?: StagedFile): Record<string, unknown> {
    if (!stage) return {};

    const rawModel = { ...(stage.verifyRawModel ?? {}) };
    const detail = stage.verified?.aiDetail ?? stage.verifyModel?.detail ?? [];
    const status = stage.verifyModel?.status?.trim() || stage.verified?.aiStatus || '';

    if (!rawModel['detail'] && detail.length) {
      rawModel['detail'] = detail;
    }
    if (!rawModel['status'] && status) {
      rawModel['status'] = status;
    }

    if (Object.keys(rawModel).length > 0) return rawModel;
    return {
      status,
      detail,
    };
  }

  private mapCustomerTypeToInt(value: string): number {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'customer') return 1;
    if (normalized === 'vendor') return 2;
    if (normalized === 'others') return 3;
    return 0;
  }

  private mapRelatedPidToInt(value: string): number {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
    if (normalized === 'project') return 1;
    if (normalized === 'nonproject') return 2;
    return 0;
  }

  private mapReminderToInt(value: string): number {
    const normalized = value.trim().toLowerCase();
    if (normalized.includes('no reminder')) return 1;
    if (normalized.includes('60')) return 2;
    if (normalized.includes('90')) return 3;
    const digits = normalized.match(/\d+/);
    return digits ? Number(digits[0]) : 0;
  }

  private toIsoDateTime(raw: string): string {
    const input = (raw ?? '').trim();
    if (!input) return new Date().toISOString();

    const directDate = new Date(input);
    if (!Number.isNaN(directDate.getTime())) return directDate.toISOString();

    const monthMap: Record<string, number> = {
      januari: 0,
      februari: 1,
      maret: 2,
      april: 3,
      mei: 4,
      juni: 5,
      juli: 6,
      agustus: 7,
      september: 8,
      oktober: 9,
      november: 10,
      desember: 11,
    };

    const m = input.toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
    if (m) {
      const day = Number(m[1]);
      const month = monthMap[m[2]];
      const year = Number(m[3]);
      if (Number.isFinite(day) && Number.isFinite(year) && month !== undefined) {
        return new Date(Date.UTC(year, month, day, 0, 0, 0)).toISOString();
      }
    }

    return new Date().toISOString();
  }

  stagedStatusClass(status: StagedStatus): string {
    switch (status) {
      case 'pending': return 'text-amber-500';
      case 'verifying': return 'text-blue-500';
      case 'verified': return 'text-emerald-600';
      case 'error': return 'text-red-500';
      default: return 'text-slate-400';
    }
  }

  stagedStatusText(status: StagedStatus): string {
    switch (status) {
      case 'pending': return 'Pending';
      case 'verifying': return 'Verifying';
      case 'verified': return 'Verified';
      case 'error': return 'Failed';
      default: return 'Unknown';
    }
  }

  private persistContract(allFiles: LegalContractFile[], log: SubmissionLogEntry[]): void {
    const user = this.auth.currentUser();
    const now  = new Date().toISOString();
    const newEntry: ApprovalLogEntry = {
      action  : this.isCreateMode ? 'Submitted' : 'Updated',
      userName: user?.name ?? 'User',
      userRole: user?.role ?? 'user',
      date    : now,
      comment : this.isCreateMode ? 'Initial submission' : 'Contract updated',
    };

    // Build the local-storage log entry (what form fields were saved)
    const localEntry: SubmissionLogEntry = {
      timestamp   : now,
      step        : 'local-storage',
      status      : 'info',
      savedLocally: {
        contractId        : this.contractId,
        tipeRequest       : this.tipeRequest,
        judulKontrak      : this.judulKontrak,
        customerType      : this.customerType,
        customer          : this.customer,
        relatedPid        : this.relatedPid,
        projectCode       : this.projectCode,
        picKontrak1       : this.picKontrak1,
        spvOtherMember    : this.spvOtherMember,
        projectDec        : this.projectDec,
        pidReference      : this.pidReference,
        noKontrak         : this.noKontrak,
        mulaiMasaBerlaku  : this.mulaiMasaBerlaku,
        selesaiMasaBerlaku: this.selesaiMasaBerlaku,
        reminderIn        : this.reminderIn,
        noRefVdi          : this.noRefVdi,
        kodeArsip         : this.kodeArsip,
        notes             : this.notes,
      },
      note: 'These form fields are saved in localStorage after save API submission.',
    };
    log.push(localEntry);

    const contract: LegalContract = {
      contractId        : this.contractId,
      tipeRequest       : this.tipeRequest,
      judulKontrak      : this.judulKontrak,
      customerType      : this.customerType,
      customer          : this.customer,
      relatedPid        : this.relatedPid,
      projectCode       : this.projectCode,
      picKontrak1       : this.picKontrak1,
      spvOtherMember    : this.spvOtherMember,
      projectDec        : this.projectDec,
      pidReference      : this.pidReference,
      noKontrak         : this.noKontrak,
      mulaiMasaBerlaku  : this.mulaiMasaBerlaku,
      selesaiMasaBerlaku: this.selesaiMasaBerlaku,
      reminderIn        : this.reminderIn,
      noRefVdi          : this.noRefVdi,
      kodeArsip         : this.kodeArsip,
      notes             : this.notes,
      fileUploads       : allFiles,
      approvalLog       : [...this.approvalLog, newEntry],
      submissionLog     : log,
      status            : this.isCreateMode ? 'Submitted'
                          : this.savedStatus === 'Submit Revision' ? 'Updated'
                          : this.savedStatus,
      createdAt         : this.isCreateMode ? now : (this.savedCreatedAt || now),
    };

    try {
      const raw = localStorage.getItem(LEGAL_CONTRACT_LS_KEY);
      let contracts: LegalContract[] = raw ? JSON.parse(raw) : [];
      if (this.isCreateMode) {
        contracts = [contract, ...contracts];
      } else {
        const idx = contracts.findIndex(c => c.contractId === this.contractId);
        if (idx >= 0) contracts[idx] = contract;
        else contracts = [contract, ...contracts];
      }
      localStorage.setItem(LEGAL_CONTRACT_LS_KEY, JSON.stringify(contracts));
      this.isSaving       = false;
      this.submitProgress = '';
      this.saveSuccess    = true;
      this.toastTimer = setTimeout(() => {
        this.saveSuccess = false;
        this.router.navigate(['/legal-contract']);
      }, 1600);
    } catch {
      this.isSaving       = false;
      this.submitProgress = '';
      this.formError      = 'Failed to save. Please try again.';
    }
  }

  downloadLog(): void {
    const log = this.lastSubmitLog;
    if (!log.length) return;
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `submission-log-${this.contractId.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  actionBadgeClass(action: string): string {
    switch (action) {
      case 'Submitted': return 'log-badge-submitted';
      case 'Updated':   return 'log-badge-updated';
      case 'Accepted':  return 'log-badge-accepted';
      default:          return 'log-badge-default';
    }
  }
}
