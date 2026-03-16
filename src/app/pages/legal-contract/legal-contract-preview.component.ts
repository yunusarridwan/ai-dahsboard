import { Component, OnInit, OnDestroy, SecurityContext, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { FileStorageService } from '../../services/file-storage.service';
import {
  LegalContract, LegalContractFile, UserComment, ApprovalLogEntry,
  LEGAL_CONTRACT_LS_KEY
} from './legal-contract-list.component';

export interface DocComment {
  id: string;
  author: string;
  date: string;
  text: string;
  anchoredText?: string;  // the exact text range this comment is anchored to in the document
  colorIdx: number;        // 0-7, assigned per unique author
}

interface ApiContractByIdItem {
  id: string;
  requestType?: string;
  contractTitle?: string;
  customerType?: string;
  relatePID?: string;
  customer?: string;
  projectCode?: string;
  piC_Contract?: string;
  spv?: string;
  project_Dec?: string;
  piD_Ref?: string;
  contract_No?: string;
  contract_StartDate?: string;
  contract_EndDate?: string;
  reminder?: string;
  ref_VDI?: string;
  archive_Code?: string;
  notes?: string;
  nameFile?: string;
  pathFile?: string;
  status?: string;
  persentase?: string;
  createdAt?: string;
  data?: unknown;
  detail?: unknown;
}

@Component({
  selector: 'app-legal-contract-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './legal-contract-preview.component.html',
  styleUrl: './legal-contract-preview.component.css'
})
export class LegalContractPreviewComponent implements OnInit, OnDestroy {
  private readonly GET_BY_ID_URL = '/api/contractAI/getbyid';
  private readonly PREVIEW_URL = '/api/contractAI/preview';

  @ViewChild('docxContainer') docxContainer?: ElementRef<HTMLDivElement>;

  contract: LegalContract | null = null;
  contractId = '';

  selectedFile: LegalContractFile | null = null;
  docHtml: SafeHtml | null = null;
  pdfUrl: string | null = null;
  docComments: DocComment[] = [];
  isLoadingDoc = false;
  docLoadError = '';
  isLocalCopy  = false;   // true when the document is served from IndexedDB
  docxRendered = false;

  private localObjectUrl: string | null = null;  // revoked on destroy / file switch

  // right panel tab
  activeTab: 'annotations' | 'comments' | 'docComments' = 'annotations';
  activeCommentId: string | null = null;  // id of the currently highlighted comment
  activeFindingIndex: number | null = null;
  findingJumpMessage = '';
  private findingFlashTimer?: ReturnType<typeof setTimeout>;

  newComment = '';

  // ── Reviewer approval panel ───────────────────────────────────
  showApprovalPanel = false;
  reviewAction = '';
  reviewNote = '';
  reviewSubmitting = false;
  readonly reviewActions = ['Approved', 'Rejected', 'Pending', 'Need Revision'] as const;

  get isReviewer(): boolean { return this.auth.userRole() === 'reviewer'; }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private http: HttpClient,
    private fileStorage: FileStorageService,
    public auth: AuthService
  ) {}

  ngOnInit(): void {
    this.contractId = decodeURIComponent(this.route.snapshot.paramMap.get('id') ?? '');
    this.loadContract();
  }

  ngOnDestroy(): void {
    this.revokeLocalUrl();
    clearTimeout(this.findingFlashTimer);
  }

  private loadContract(): void {
    const headers = this.apiHeaders();

    this.http.get(`${this.GET_BY_ID_URL}?id=${encodeURIComponent(this.contractId)}`, { responseType: 'text', headers }).subscribe({
      next: (raw) => {
        const apiItem = this.parseGetByIdResponse(raw);
        if (!apiItem) {
          this.loadContractFromLocal();
          return;
        }

        this.contract = this.mapApiItemToContract(apiItem);
        this.persistContractSnapshot();
        if (this.contract.fileUploads?.length) this.selectFile(this.contract.fileUploads[0]);
      },
      error: () => {
        this.loadContractFromLocal();
      },
    });
  }

  private loadContractFromLocal(): void {
    try {
      const raw = localStorage.getItem(LEGAL_CONTRACT_LS_KEY);
      const all: LegalContract[] = raw ? JSON.parse(raw) : [];
      this.contract = all.find(c => c.contractId === this.contractId) ?? null;
      if (this.contract?.fileUploads?.length) {
        this.selectFile(this.contract.fileUploads[0]);
      }
    } catch {}
  }

  selectFile(f: LegalContractFile): void {
    if (this.selectedFile?.name === f.name && (this.docHtml || this.pdfUrl)) return;
    this.selectedFile = f;
    this.docHtml      = null;
    this.pdfUrl       = null;
    this.docComments  = [];
    this.docLoadError = '';
    this.findingJumpMessage = '';
    this.activeFindingIndex = null;
    this.isLocalCopy  = false;
    this.docxRendered = false;
    this.revokeLocalUrl();

    const url = this.previewUrlForId(this.contractId);
    const headers = this.apiHeaders();

    this.isLoadingDoc = true;
    this.http.get(url, { responseType: 'arraybuffer', headers }).subscribe({
      next: async (buf) => {
        if (this.isPdf(f.name)) {
          const blob = new Blob([buf], { type: 'application/pdf' });
          this.localObjectUrl = URL.createObjectURL(blob);
          this.pdfUrl = this.localObjectUrl;
          if (f.aiDetail?.length) this.activeTab = 'annotations';
          this.isLoadingDoc = false;
          return;
        }

        if (this.isDocx(f.name)) {
          try {
            await this.parseDocx(buf);
            setTimeout(() => { void this.renderDocxVisual(buf); }, 0);
          } catch (e: any) {
            this.docLoadError = `Could not parse document: ${e?.message ?? 'unknown error'}`;
          }
          this.isLoadingDoc = false;
          return;
        }

        this.isLoadingDoc = false;
      },
      error: () => {
        this.isLoadingDoc = false;
        this.loadFromLocal(f);
      },
    });

  }

  private previewUrlForId(id: string): string {
    return `${this.PREVIEW_URL}?id=${encodeURIComponent(id)}`;
  }

  private parseGetByIdResponse(raw: string): ApiContractByIdItem | null {
    const text = (raw ?? '').trim().replace(/^\uFEFF/, '');
    if (!text) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first < 0 || last <= first) return null;
      try {
        parsed = JSON.parse(text.slice(first, last + 1));
      } catch {
        return null;
      }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;

    const direct = typeof obj['id'] === 'string' ? (obj as unknown as ApiContractByIdItem) : null;
    if (direct) return direct;

    const data = obj['data'];
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const merged = { ...(data as Record<string, unknown>) } as unknown as ApiContractByIdItem;
      if (obj['detail'] !== undefined && merged.detail === undefined) merged.detail = obj['detail'];
      return merged;
    }
    if (Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === 'object') {
      const merged = { ...(data[0] as Record<string, unknown>) } as unknown as ApiContractByIdItem;
      if (obj['detail'] !== undefined && merged.detail === undefined) merged.detail = obj['detail'];
      return merged;
    }

    return null;
  }

  private mapApiItemToContract(item: ApiContractByIdItem): LegalContract {
    const local = this.findLocalContract(item.id);
    const detail = this.extractAiDetail(item, local);
    const fileName = item.nameFile || `contract-${item.id}.docx`;

    return {
      contractId: item.id,
      tipeRequest: item.requestType || '-',
      judulKontrak: item.contractTitle || fileName,
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
      fileUploads: [{
        name: fileName,
        size: 0,
        uploadedAt: item.createdAt || new Date().toISOString(),
        apiPath: item.pathFile || '',
        aiDetail: detail,
        aiStatus: item.status || '',
      }],
      approvalLog: local?.approvalLog ?? [],
      submissionLog: local?.submissionLog ?? [],
      userComments: local?.userComments ?? [],
      status: item.status || 'Submitted',
      createdAt: item.createdAt || new Date().toISOString(),
    };
  }

  private extractAiDetail(
    item: ApiContractByIdItem,
    local?: LegalContract | null
  ): { Topik: string; Posisi: string; deskripsi: string }[] {
    const dataObj = (item.data && typeof item.data === 'object' && !Array.isArray(item.data))
      ? item.data as Record<string, unknown>
      : null;
    const modelObj = (dataObj?.['model'] && typeof dataObj['model'] === 'object' && !Array.isArray(dataObj['model']))
      ? dataObj['model'] as Record<string, unknown>
      : null;

    const candidates: unknown[] = [
      item.detail,
      dataObj?.['detail'],
      modelObj?.['detail'],
      item.data,
    ];

    for (const c of candidates) {
      const rows = this.normalizeDetailRows(c);
      if (rows.length) return rows;
    }

    if (typeof item.data === 'string') {
      try {
        const parsed = JSON.parse(item.data) as Record<string, unknown>;
        const rows = this.normalizeDetailRows(
          parsed['detail']
          ?? (parsed['data'] as Record<string, unknown> | undefined)?.['detail']
          ?? (parsed['model'] as Record<string, unknown> | undefined)?.['detail']
          ?? ((parsed['data'] as Record<string, unknown> | undefined)?.['model'] as Record<string, unknown> | undefined)?.['detail']
          ?? parsed['verifySummary']
          ?? parsed['result']
          ?? parsed['findings']
        );
        if (rows.length) return rows;
      } catch {}
    }

    const localRows = local?.fileUploads?.[0]?.aiDetail ?? [];
    if (localRows.length) return localRows;

    return [];
  }

  private normalizeDetailRows(raw: unknown): { Topik: string; Posisi: string; deskripsi: string }[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .map((x) => {
        if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
        const r = x as Record<string, unknown>;
        const topik = this.pickString(r, ['Topik', 'topik', 'topic']);
        const posisi = this.pickString(r, ['Posisi', 'posisi', 'position']);
        const deskripsi = this.pickString(r, ['deskripsi', 'Deskripsi', 'description']);
        if (!topik && !posisi && !deskripsi) return null;
        return { Topik: topik, Posisi: posisi, deskripsi };
      })
      .filter((x): x is { Topik: string; Posisi: string; deskripsi: string } => !!x);
  }

  private pickString(obj: Record<string, unknown>, keys: string[]): string {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }

    const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, '');
    const map = new Map<string, string>();
    for (const k of Object.keys(obj)) map.set(norm(k), k);
    for (const k of keys) {
      const found = map.get(norm(k));
      if (!found) continue;
      const v = obj[found];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }

    return '';
  }

  private apiHeaders(): HttpHeaders {
    return new HttpHeaders({
      Accept: 'application/json',
      'ngrok-skip-browser-warning': 'true',
    });
  }

  private findLocalContract(id: string): LegalContract | null {
    try {
      const raw = localStorage.getItem(LEGAL_CONTRACT_LS_KEY);
      const all: LegalContract[] = raw ? JSON.parse(raw) : [];
      return all.find(c => c.contractId === id) ?? null;
    } catch {
      return null;
    }
  }

  private persistContractSnapshot(): void {
    if (!this.contract) return;
    try {
      const raw = localStorage.getItem(LEGAL_CONTRACT_LS_KEY);
      const all: LegalContract[] = raw ? JSON.parse(raw) : [];
      const idx = all.findIndex(c => c.contractId === this.contractId);
      if (idx >= 0) all[idx] = { ...all[idx], ...this.contract };
      else all.unshift(this.contract);
      localStorage.setItem(LEGAL_CONTRACT_LS_KEY, JSON.stringify(all));
    } catch {}
  }

  /** Tries to load the file from IndexedDB.  Falls back to an error message on miss. */
  private async loadFromLocal(f: LegalContractFile, successMsg?: string): Promise<void> {
    this.isLoadingDoc = true;
    try {
      const stored = await this.fileStorage.getFile(this.contractId, f.name);
      if (!stored) {
        this.docLoadError =
          'Server is not reachable and no local copy was found. ' +
          'Upload the file again so it can be cached locally.';
        this.isLoadingDoc = false;
        return;
      }
      this.isLocalCopy = true;
      if (this.isPdf(f.name)) {
        this.localObjectUrl = URL.createObjectURL(stored);
        this.pdfUrl = this.localObjectUrl;
        if (f.aiDetail?.length) this.activeTab = 'annotations';
      } else if (this.isDocx(f.name)) {
        const buf = await stored.arrayBuffer();
        await this.parseDocx(buf);
        setTimeout(() => { void this.renderDocxVisual(buf); }, 0);
      }
    } catch (e: any) {
      this.docLoadError = `Could not load local copy: ${e?.message ?? 'unknown error'}`;
    }
    this.isLoadingDoc = false;
  }

  private revokeLocalUrl(): void {
    if (this.localObjectUrl) {
      URL.revokeObjectURL(this.localObjectUrl);
      this.localObjectUrl = null;
    }
  }

  private async parseDocx(buf: ArrayBuffer): Promise<void> {
    // 1 — convert docx -> HTML fallback; map comment-reference to a hidden span to suppress [V1] markers
    const mam = await import('mammoth');
    const result = await mam.convertToHtml(
      { arrayBuffer: buf },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h3.doc-h1:fresh",
          "p[style-name='Heading 2'] => h4.doc-h2:fresh",
          "p[style-name='Heading 3'] => h5.doc-h3:fresh",
          "comment-reference         => span.cmt-ref-hidden"
        ]
      }
    );

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);

    // 2 — extract comment text-ranges from document.xml
    let ranges = new Map<string, string>();
    const docXmlFile = zip.file('word/document.xml') ?? zip.file('word/Document.xml');
    if (docXmlFile) {
      const docXml = await docXmlFile.async('text');
      ranges = this.parseDocumentXmlForCommentRanges(docXml);
    }

    // 3 — parse comment metadata
    const cmtFile = zip.file('word/comments.xml') ?? zip.file('word/Comments.xml');
    let comments: DocComment[] = [];
    if (cmtFile) {
      const xml = await cmtFile.async('text');
      comments = this.parseCommentsXml(xml);
      for (const dc of comments) {
        const anchored = ranges.get(dc.id);
        if (anchored?.trim()) dc.anchoredText = anchored.trim();
      }
    }

    // 4 — assign a unique color (0-7) per unique author so every person
    //     gets a consistent color across all their highlights and cards.
    const authorColorMap = new Map<string, number>();
    let nextColor = 0;
    for (const dc of comments) {
      if (!authorColorMap.has(dc.author)) {
        authorColorMap.set(dc.author, nextColor++ % 8);
      }
      dc.colorIdx = authorColorMap.get(dc.author)!;
    }

    // 5 — build id→colorIdx map (only for comments that have an anchor range)
    const idColorMap = new Map<string, number>();
    for (const dc of comments) {
      if (dc.anchoredText !== undefined) {
        idColorMap.set(dc.id, dc.colorIdx);
      }
    }

    // 6 — sanitize mammoth output, then inject colored <mark> anchors, then bypass
    const safe       = this.sanitizer.sanitize(SecurityContext.HTML, result.value) ?? '';
    const markedHtml = this.injectCommentHighlights(safe, ranges, idColorMap);
    this.docHtml     = this.sanitizer.bypassSecurityTrustHtml(`<article class="doc-page">${markedHtml}</article>`);

    // 7 — visual rendering is triggered by callers after loading state flips.
    this.docxRendered = false;

    this.docComments = comments;
    if (comments.length) this.activeTab = 'docComments';
    if (!comments.length && this.annotations.length) this.activeTab = 'annotations';
  }

  private async renderDocxVisual(buf: ArrayBuffer): Promise<void> {
    try {
      const container = this.docxContainer?.nativeElement;
      if (!container) return;

      container.innerHTML = '';
      const docxPreview: any = await import('docx-preview');
      await docxPreview.renderAsync(buf, container, undefined, {
        className: 'docx',
        inWrapper: true,
        breakPages: true,
        ignoreWidth: false,
        ignoreHeight: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        useBase64URL: true,
      });

      this.docxRendered = true;
    } catch {
      this.docxRendered = false;
    }
  }

  /**
   * Walks word/document.xml in document order and records the plain text
   * that falls between each pair of commentRangeStart / commentRangeEnd elements.
   */
  private parseDocumentXmlForCommentRanges(xml: string): Map<string, string> {
    const result = new Map<string, string>();
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'application/xml');
      const ns  = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

      const body = doc.getElementsByTagNameNS(ns, 'body')[0]
                ?? doc.querySelector('w\\:body, body');
      if (!body) return result;

      const activeRanges = new Map<string, string>(); // id → accumulated text

      // TreeWalker visits elements in document order (depth-first)
      const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
      let node: Node | null = walker.currentNode;
      while (node) {
        const el    = node as Element;
        const local = (el.localName ?? '').toLowerCase();

        if (local === 'commentrangestart') {
          const id = el.getAttribute('w:id') ?? el.getAttributeNS(ns, 'id') ?? '';
          if (id) activeRanges.set(id, '');
        } else if (local === 't') {
          const text = el.textContent ?? '';
          for (const [id] of activeRanges) {
            activeRanges.set(id, (activeRanges.get(id) ?? '') + text);
          }
        } else if (local === 'commentrangeend') {
          const id = el.getAttribute('w:id') ?? el.getAttributeNS(ns, 'id') ?? '';
          if (id && activeRanges.has(id)) {
            result.set(id, activeRanges.get(id) ?? '');
            activeRanges.delete(id);
          }
        }

        node = walker.nextNode();
      }
    } catch {}
    return result;
  }

  /**
   * Wraps anchored text ranges in the raw mammoth HTML with
   * <mark class="cmt-anchor" id="cmt-anchor-{id}"> so they are
   * visible and scrollable in the document viewer.
   */
  private injectCommentHighlights(html: string, ranges: Map<string, string>, idColorMap: Map<string, number>): string {
    let out = html;
    // Track which exact strings we've already wrapped to avoid double-marking
    const wrapped = new Set<string>();

    for (const [id, rawText] of ranges) {
      const text = rawText.trim();
      if (!text || wrapped.has(text)) continue;

      // mammoth HTML-encodes &, <, > in text content
      const esc = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      if (!esc.trim()) continue;

      const c = idColorMap.get(id) ?? 0;
      const mark = (matched: string) =>
        `<mark class="cmt-anchor cmt-c${c}" id="cmt-anchor-${id}">${matched}</mark>`;

      // Try 1: literal escaped match
      const exactRe = new RegExp(esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (exactRe.test(out)) {
        out = out.replace(exactRe, mark);
        wrapped.add(text);
        continue;
      }

      // Try 2: flexible — allow up to 80 chars of HTML tags between words
      //         (handles runs split by <strong>, <em>, etc.)
      const words = esc
        .split(/\s+/).filter(Boolean)
        .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (words.length > 1) {
        const flexRe = new RegExp(words.join('(?:[\\s\\S]{0,80}?)'));
        if (flexRe.test(out)) {
          out = out.replace(flexRe, m => mark(m));
          wrapped.add(text);
        }
      }
    }
    return out;
  }

  private parseCommentsXml(xml: string): DocComment[] {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');
    const ns     = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    // getElementsByTagNameNS works for elements; for attributes use getAttribute('w:x')
    // because browser DOMParser does not reliably resolve namespace-prefixed attributes
    // via getAttributeNS when the prefix is declared on an ancestor element.
    const nodes = Array.from(xmlDoc.getElementsByTagNameNS(ns, 'comment'));

    // Fallback: if namespace-aware lookup yields nothing (e.g. DOMParser quirk),
    // try a plain tag-name query on the serialised prefix form.
    const candidates = nodes.length > 0
      ? nodes
      : Array.from(xmlDoc.querySelectorAll('comment, w\\:comment'));

    return candidates.map(el => {
      // Collect all <w:t> text runs inside this comment element
      const tNodes = [
        ...Array.from(el.getElementsByTagNameNS(ns, 't')),
        ...Array.from(el.getElementsByTagName('w:t')),
      ];
      // Deduplicate nodes that appear in both lists
      const seen = new Set<Node>();
      const uniqueT = tNodes.filter(n => { if (seen.has(n)) return false; seen.add(n); return true; });
      const text = uniqueT.map(t => t.textContent ?? '').join('').trim();

      // getAttribute('w:id') is reliable; getAttributeNS is not for namespace-prefixed attrs
      return {
        id    : el.getAttribute('w:id')     ?? el.getAttributeNS(ns, 'id')     ?? '',
        author: el.getAttribute('w:author') ?? el.getAttributeNS(ns, 'author') ?? 'Unknown',
        date  : el.getAttribute('w:date')   ?? el.getAttributeNS(ns, 'date')   ?? '',
        text,
        colorIdx: 0,  // filled in by parseDocx after author assignment
      } as DocComment;
    }).filter(c => c.text.length > 0);
  }

  // ── Type helpers ──────────────────────────────────────────────

  isDocx(name: string): boolean {
    const n = (name ?? '').toLowerCase();
    return n.endsWith('.doc') || n.endsWith('.docx');
  }
  isPdf(name: string): boolean {
    return (name ?? '').toLowerCase().endsWith('.pdf');
  }

  /**
   * Activates a comment: scrolls the document viewer to the highlighted text
   * and visually marks the card + the in-document anchor.
   */
  scrollToComment(id: string): void {
    this.activeCommentId = id;
    setTimeout(() => {
      // Remove any existing active highlight
      document.querySelectorAll('.cmt-anchor.active-anchor')
        .forEach(el => el.classList.remove('active-anchor'));

      const anchor = document.getElementById('cmt-anchor-' + id);
      if (!anchor) {
        // In visual DOCX mode there are no injected mark anchors; fallback to text search.
        const dc = this.docComments.find(c => c.id === id);
        const target = this.findTextAnchor(dc?.anchoredText ?? '');
        if (!target) return;

        const container = this.docxContainer?.nativeElement?.closest('.doc-html-view') as HTMLElement | null;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const targetRect    = target.getBoundingClientRect();
          const offset = targetRect.top - containerRect.top + container.scrollTop
                         - container.clientHeight / 2 + targetRect.height / 2;
          container.scrollTo({ top: offset, behavior: 'smooth' });
        } else {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }

      anchor.classList.add('active-anchor');

      // The doc viewer is an overflow-y:auto flex child — scrollIntoView only
      // works on the window, not sub-scroll containers. Manually compute offset.
      const container = document.querySelector('.doc-html-view') as HTMLElement | null;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const anchorRect    = anchor.getBoundingClientRect();
        const offset = anchorRect.top - containerRect.top + container.scrollTop
                       - container.clientHeight / 2 + anchorRect.height / 2;
        container.scrollTo({ top: offset, behavior: 'smooth' });
      } else {
        anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }

  private findTextAnchor(rawText: string): HTMLElement | null {
    const container = this.docxContainer?.nativeElement;
    if (!container || !rawText.trim()) return null;

    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const target = normalize(rawText);
    const targetSnippet = target.length > 70 ? target.slice(0, 70) : target;
    if (!targetSnippet) return null;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node) {
      const text = normalize(node.textContent ?? '');
      if (text.includes(targetSnippet)) {
        return (node.parentElement as HTMLElement | null) ?? null;
      }
      node = walker.nextNode();
    }
    return null;
  }

  /**
   * Groups flat docComments into threaded conversations with global numbering.
   * Root = comment with an anchoredText (has a range in document.xml).
   * Replies = immediately following comments without their own anchor range.
   */
  get docThreads(): {
    root: DocComment;
    rootIdx: number;
    replies: { dc: DocComment; idx: number }[];
  }[] {
    const threads: { root: DocComment; rootIdx: number; replies: { dc: DocComment; idx: number }[] }[] = [];
    let current: typeof threads[0] | null = null;
    let gi = 0;
    for (const dc of this.docComments) {
      if (dc.anchoredText !== undefined) {
        current = { root: dc, rootIdx: gi, replies: [] };
        threads.push(current);
      } else if (current) {
        current.replies.push({ dc, idx: gi });
      } else {
        current = { root: dc, rootIdx: gi, replies: [] };
        threads.push(current);
      }
      gi++;
    }
    return threads;
  }

  get safePdfUrl() {
    return this.pdfUrl
      ? this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfUrl)
      : null;
  }

  /** Approval log sorted ascending by date (oldest → newest) */
  get sortedApprovalLog(): ApprovalLogEntry[] {
    return [...(this.contract?.approvalLog ?? [])].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  // ── AI annotations ────────────────────────────────────────────

  get annotations(): { Topik: string; Posisi: string; deskripsi: string }[] {
    return this.selectedFile?.aiDetail ?? [];
  }

  jumpToFinding(a: { Topik: string; Posisi: string; deskripsi: string }, idx: number): void {
    this.activeFindingIndex = idx;
    this.findingJumpMessage = '';

    if (!this.selectedFile) return;
    if (this.isPdf(this.selectedFile.name)) {
      this.findingJumpMessage = 'Jump to clause is available for DOC/DOCX documents.';
      return;
    }

    const posisi = (a.Posisi ?? '').trim();
    if (!posisi || posisi.toLowerCase().includes('tidak ditemukan')) {
      this.findingJumpMessage = 'Clause position is not available for this finding.';
      return;
    }

    const container = document.querySelector('.doc-html-view') as HTMLElement | null;
    const searchRoot = this.docxContainer?.nativeElement ?? container;
    if (!searchRoot) {
      this.findingJumpMessage = 'Document viewer is not ready yet.';
      return;
    }

    const clauseToken = this.extractClauseToken(posisi);
    const target = this.findClauseHeaderAnchor(searchRoot, clauseToken);
    if (!target) {
      this.findingJumpMessage = `Exact clause header ${posisi} was not found in this document.`;
      return;
    }

    this.scrollElementIntoView(target, container);
    this.flashFindingTarget(target);
    this.findingJumpMessage = `Jumped to ${posisi}.`;
  }

  private extractClauseToken(posisi: string): string {
    const normalized = posisi.replace(/\s+/g, ' ').trim();
    const m = normalized.match(/pasal\s*[:\-]?\s*(\d+[a-z]?)/i);
    if (m?.[1]) return `pasal ${m[1]}`;
    return normalized;
  }

  private findClauseHeaderAnchor(root: HTMLElement, clauseToken: string): HTMLElement | null {
    const target = clauseToken.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!target) return null;

    const candidates = Array.from(root.querySelectorAll('p,h1,h2,h3,h4,h5,h6,div,span'));
    let best: { el: HTMLElement; score: number } | null = null;

    for (const el of candidates) {
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!text || !text.includes(target)) continue;

      const exactClause = /^pasal\s*[:\-]?\s*\d+[a-z]?$/i.test(text);
      const startsWith = text.startsWith(target);
      const shortText = text.length <= Math.max(18, target.length + 8);
      const headingLike = /pasal\s*[:\-]?\s*\d+[a-z]?/i.test(text);
      const normalizedExact = text.replace(/\s+/g, ' ') === target;

      let score = 0;
      if (exactClause) score += 120;
      if (normalizedExact) score += 100;
      if (startsWith) score += 70;
      if (shortText) score += 40;
      if (headingLike) score += 30;
      if (text.includes('ayat')) score -= 15;

      if (!best || score > best.score) {
        best = { el: el as HTMLElement, score };
      }
    }

    return best?.el ?? null;
  }

  private scrollElementIntoView(target: HTMLElement, container: HTMLElement | null): void {
    if (!container) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top + container.scrollTop
      - container.clientHeight / 2 + targetRect.height / 2;
    container.scrollTo({ top: offset, behavior: 'smooth' });
  }

  private flashFindingTarget(target: HTMLElement): void {
    clearTimeout(this.findingFlashTimer);
    target.classList.remove('finding-hit');
    target.classList.remove('finding-hit-heading');

    const normalized = (target.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const isClauseHeading = /^pasal\s*[:\-]?\s*\d+[a-z]?$/i.test(normalized);

    // Force reflow to restart animation when same target is clicked repeatedly.
    void target.offsetWidth;
    target.classList.add(isClauseHeading ? 'finding-hit-heading' : 'finding-hit');
    this.findingFlashTimer = setTimeout(() => {
      target.classList.remove('finding-hit');
      target.classList.remove('finding-hit-heading');
    }, 1800);
  }

  posisiColor(posisi: string): string {
    const p = (posisi ?? '').toLowerCase();
    if (p.includes('tidak ditemukan')) return '#ef4444';
    if (p.includes('sesuai') || p.includes('ada') || p.includes('ditemukan')) return '#10b981';
    return '#f59e0b';
  }
  posisiBg(posisi: string): string {
    const p = (posisi ?? '').toLowerCase();
    if (p.includes('tidak ditemukan')) return '#fef2f2';
    if (p.includes('sesuai') || p.includes('ada') || p.includes('ditemukan')) return '#f0fdf4';
    return '#fffbeb';
  }

  // ── User comments ─────────────────────────────────────────────

  get comments(): UserComment[] { return (this.contract?.userComments ?? []).slice(); }

  addComment(): void {
    if (!this.newComment.trim() || !this.contract) return;
    const user = this.auth.currentUser();
    const entry: UserComment = {
      id      : Date.now().toString(),
      text    : this.newComment.trim(),
      userName: user?.name ?? 'User',
      userRole: user?.role ?? 'user',
      date    : new Date().toISOString(),
      fileRef : this.selectedFile?.name,
    };
    if (!this.contract.userComments) this.contract.userComments = [];
    this.contract.userComments.unshift(entry);
    this.persist();
    this.newComment = '';
  }

  deleteComment(id: string): void {
    if (!this.contract) return;
    this.contract.userComments = (this.contract.userComments ?? []).filter(c => c.id !== id);
    this.persist();
  }

  canDelete(c: UserComment): boolean {
    const user = this.auth.currentUser();
    return !!(user && (user.name === c.userName || user.role === 'reviewer'));
  }

  private persist(): void {
    try {
      const raw = localStorage.getItem(LEGAL_CONTRACT_LS_KEY);
      let all: LegalContract[] = raw ? JSON.parse(raw) : [];
      const idx = all.findIndex(c => c.contractId === this.contractId);
      if (idx >= 0 && this.contract) all[idx] = this.contract;
      localStorage.setItem(LEGAL_CONTRACT_LS_KEY, JSON.stringify(all));
    } catch {}
  }

  // ── Reviewer: submit approval decision ───────────────────────

  submitReview(): void {
    if (!this.reviewAction || !this.contract) return;
    const user = this.auth.currentUser();
    const entry: ApprovalLogEntry = {
      action  : this.reviewAction,
      userName: user?.name ?? 'Reviewer',
      userRole: user?.role ?? 'reviewer',
      date    : new Date().toISOString(),
      comment : this.reviewNote.trim(),
    };
    if (!this.contract.approvalLog) this.contract.approvalLog = [];
    this.contract.approvalLog.unshift(entry);

    // Map action → contract status
    const statusMap: Record<string, string> = {
      'Approved'      : 'Accepted',
      'Rejected'      : 'Rejected',
      'Pending'       : 'Pending',
      'Need Revision' : 'Submit Revision',
    };
    this.contract.status = statusMap[this.reviewAction] ?? this.contract.status;

    this.persist();
    this.showApprovalPanel = false;
    this.reviewAction = '';
    this.reviewNote   = '';
    // Switch to the Discussion tab so the user sees the new log entry
    this.activeTab = 'comments';
  }

  closeApprovalPanel(): void {
    this.showApprovalPanel = false;
    this.reviewAction = '';
    this.reviewNote   = '';
  }

  reviewActionColor(action: string): string {
    switch (action) {
      case 'Approved'      : return '#10b981';
      case 'Rejected'      : return '#ef4444';
      case 'Pending'       : return '#f59e0b';
      case 'Need Revision' : return '#8b5cf6';
      default              : return '#64748b';
    }
  }

  // ── Navigation ────────────────────────────────────────────────

  goBack(): void { this.router.navigate(['/legal-contract']); }
  openForm(): void { this.router.navigate(['/legal-contract', encodeURIComponent(this.contractId)]); }

  downloadFile(): void {
    if (!this.selectedFile) return;
    const url = this.previewUrlForId(this.contractId);
    const headers = this.apiHeaders();

    this.http.get(url, { responseType: 'blob', headers }).subscribe({
      next: (blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = this.selectedFile?.name || `contract-${this.contractId}`;
        a.click();
        URL.revokeObjectURL(objectUrl);
      },
    });
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('id-ID', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  }

  formatSize(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  }

  initial(name: string): string {
    return (name ?? '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }
  avatarColor(role: string): string {
    return role === 'reviewer' ? '#7c3aed' : '#2563eb';
  }
}
