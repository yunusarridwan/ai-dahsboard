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
  paraId?: string;
  parentParaId?: string;
  colorIdx: number;        // 0-7, assigned per unique author
}

interface DocCommentThread {
  root: DocComment;
  replies: DocComment[];
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
  private docCommentThreadsInternal: DocCommentThread[] = [];
  private commentAnchorDomIdMap = new Map<string, string>();
  private docxBufferWithBookmarks: ArrayBuffer | null = null;
  isLoadingDoc = false;
  docLoadError = '';
  isLocalCopy  = false;   // true when the document is served from IndexedDB
  docxRendered = false;

  private localObjectUrl: string | null = null;  // revoked on destroy / file switch

  // right panel tab
  activeTab: 'annotations' | 'comments' | 'docComments' = 'annotations';
  activeCommentId: string | null = null;  // id of the currently highlighted comment

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
        console.log(apiItem);
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
    this.commentAnchorDomIdMap.clear();
    this.docxBufferWithBookmarks = null;
    this.docLoadError = '';
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
            const renderBuf = this.docxBufferWithBookmarks ?? buf;
            setTimeout(() => { void this.renderDocxVisual(renderBuf); }, 0);
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
    // const detail = this.extractAiDetail(item, local);
    console.log("data : ",item);
    const detail = this.extractAiDetail(item);
    // console.log(local);
    console.log(detail);
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
    const candidates: unknown[] = [item.data, item.detail];

    for (const c of candidates) {
      console.log("data c = ", c);
      const rows = this.normalizeDetailRows(c);
      console.log("rows",rows);
      if (rows.length) return rows;
    }

    if (item.data && typeof item.data === 'object') {
      const rows = this.normalizeDetailRows((item.data as any).detail);
      if (rows.length) return rows;
    }

    if (typeof item.data === 'string') {
      try {
        const parsed = JSON.parse(item.data) as Record<string, unknown>;
        const rows = this.normalizeDetailRows(
          parsed['detail']
          ?? parsed['verifySummary']
          ?? parsed['result']
          ?? parsed['findings']
        );
        console.log("Rowss = ", rows);
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
        console.log("Loaded from local IndexedDB cache:", f.name, `(size: ${buf.byteLength} bytes)`);
        await this.parseDocx(buf);
        const renderBuf = this.docxBufferWithBookmarks ?? buf;
        setTimeout(() => { void this.renderDocxVisual(renderBuf); }, 0);
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
    // const mam = await import('mammoth');
    // const result = await mam.convertToHtml(
    //   { arrayBuffer: buf },
    //   {
    //     styleMap: [
    //       "p[style-name='Heading 1'] => h3.doc-h1:fresh",
    //       "p[style-name='Heading 2'] => h4.doc-h2:fresh",
    //       "p[style-name='Heading 3'] => h5.doc-h3:fresh",
    //       "comment-reference         => span.cmt-ref-hidden"
    //     ]
    //   }
    // );
    const patchedBuf = await this.injectBookmarksForComments(buf);
    this.docxBufferWithBookmarks = patchedBuf;

    const mammothModule = await import('mammoth');
    const mammoth = mammothModule.default ?? mammothModule;

    const result = await mammoth.convertToHtml(
      { arrayBuffer: patchedBuf },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h3.doc-h1:fresh",
          "p[style-name='Heading 2'] => h4.doc-h2:fresh",
          "p[style-name='Heading 3'] => h5.doc-h3:fresh",
          "comment-reference => span.cmt-ref-hidden"
        ]
      }
    );

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(patchedBuf);

    // 1 — parse extended relation map (word/commentsExtended.xml / commentsExtensible.xml)
    const relationMap = await this.parseCommentsExtendedRelations(zip);

    // 2 — parse comments content and attach paragraph relation refs
    const cmtFile = zip.file('word/comments.xml') ?? zip.file('word/Comments.xml');
    let comments: DocComment[] = [];
    if (cmtFile) {
      const xml = await cmtFile.async('text');
      comments = this.parseCommentsXml(xml, relationMap);
    }

    // 3 — parse anchored text from document.xml
    let ranges = new Map<string, string>();
    const docXmlFile = zip.file('word/document.xml') ?? zip.file('word/Document.xml');
    if (docXmlFile) {
      const docXml = await docXmlFile.async('text');
      console.log("document.xml loaded, size:", docXml.length);
      ranges = this.parseDocumentXmlForCommentRanges(docXml);
    }

    // 4 — merge anchored text into parsed comments and build root/reply threads.
    for (const dc of comments) {
      const anchored = ranges.get(dc.id);
      if (anchored?.trim()) dc.anchoredText = anchored.trim();
    }

    const threads = this.buildDocCommentThreads(comments);

    // 5 — assign a unique color (0-7) per unique author so every person
    //     gets a consistent color across all their highlights and cards.
    const authorColorMap = new Map<string, number>();
    let nextColor = 0;
    for (const dc of comments) {
      if (!authorColorMap.has(dc.author)) {
        authorColorMap.set(dc.author, nextColor++ % 8);
      }
      dc.colorIdx = authorColorMap.get(dc.author)!;
    }

    // 6 — build id→colorIdx map (only for comments that have an anchor range)
    const idColorMap = new Map<string, number>();
    for (const dc of comments) {
      if (dc.anchoredText !== undefined) {
        idColorMap.set(dc.id, dc.colorIdx);
      }
    }

    // 7 — sanitize mammoth output, then inject colored <mark> anchors, then bypass
    const safe       = this.sanitizer.sanitize(SecurityContext.HTML, result.value) ?? '';
    const highlightResult = this.injectCommentHighlights(safe, ranges, idColorMap);
    const markedHtml = highlightResult.html;
    this.commentAnchorDomIdMap = highlightResult.anchorMap;
    this.docHtml     = this.sanitizer.bypassSecurityTrustHtml(`<article class="doc-page">${markedHtml}</article>`);

    // 8 — visual rendering is triggered by callers after loading state flips.
    this.docxRendered = false;

    this.docCommentThreadsInternal = threads;
    this.docComments = this.flattenDocCommentThreads(threads);
    if (comments.length) this.activeTab = 'docComments';
    if (!comments.length && this.annotations.length) this.activeTab = 'annotations';
  }

  async injectBookmarksForComments(buf: ArrayBuffer): Promise<ArrayBuffer> {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);

    const docXmlPath = zip.file('word/document.xml')
      ? 'word/document.xml'
      : (zip.file('word/Document.xml') ? 'word/Document.xml' : null);
    if (!docXmlPath) return buf;

    const docXmlFile = zip.file(docXmlPath);
    if (!docXmlFile) return buf;

    const xml = await docXmlFile.async('text');
    const withStartBookmarks = xml.replace(
      /(<w:commentRangeStart\b[^>]*\bw:id="(\d+)"[^>]*\/>)/g,
      (_full, tag: string, id: string) =>
        `<w:bookmarkStart w:id="9999${id}" w:name="cmt-anchor-${id}"/><w:bookmarkEnd w:id="9999${id}"/>${tag}`
    );

    const updatedXml = withStartBookmarks.replace(
      /(<w:commentRangeEnd\b[^>]*\bw:id="(\d+)"[^>]*\/>)/g,
      (_full, tag: string, id: string) =>
        `<w:bookmarkStart w:id="8888${id}" w:name="cmt-anchor-end-${id}"/><w:bookmarkEnd w:id="8888${id}"/>${tag}`
    );

    if (updatedXml === xml) return buf;

    zip.file(docXmlPath, updatedXml);
    return await zip.generateAsync({ type: 'arraybuffer' });
  }

  private async parseCommentsExtendedRelations(zip: any): Promise<Map<string, { parentId?: string }>> {
    const relationMap = new Map<string, { parentId?: string }>();
    const candidates = [
      'word/commentsExtended.xml',
      'word/commentsExtensible.xml',
      'word/CommentsExtended.xml',
      'word/CommentsExtensible.xml',
    ];

    const file = candidates.map(p => zip.file(p)).find(Boolean);
    if (!file) return relationMap;

    try {
      const xml = await file.async('text');
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'application/xml');
      const nsW15 = 'http://schemas.microsoft.com/office/word/2012/wordml';

      const nodes = Array.from(xmlDoc.getElementsByTagNameNS(nsW15, 'commentEx'));
      const fallback = nodes.length > 0
        ? nodes
        : Array.from(xmlDoc.querySelectorAll('w15\\:commentEx, commentEx'));

      for (const el of fallback) {
        const paraId = el.getAttribute('w15:paraId') ?? el.getAttributeNS(nsW15, 'paraId') ?? '';
        if (!paraId) continue;
        const parentIdRaw = el.getAttribute('w15:paraIdParent') ?? el.getAttributeNS(nsW15, 'paraIdParent') ?? '';
        relationMap.set(paraId, { parentId: parentIdRaw || undefined });
      }
    } catch {
      return relationMap;
    }

    return relationMap;
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
      const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

      const body = doc.getElementsByTagNameNS(ns, 'body')[0]
        ?? doc.querySelector('w\\:body, body');
      if (!body) return result;

      const activeRanges = new Map<string, string>();
      const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
      let node: Node | null = walker.currentNode;

      while (node) {
        const el = node as Element;
        const rawName = (el.localName || el.tagName || '').toLowerCase();
        const tagName = rawName.includes(':') ? rawName.split(':').pop() ?? rawName : rawName;

        if (tagName === 'commentrangestart') {
          const id = el.getAttribute('w:id') ?? el.getAttributeNS(ns, 'id') ?? '';
          if (id) activeRanges.set(id, activeRanges.get(id) ?? '');
        } else if (tagName === 'p' || tagName === 'br') {
          for (const [id, current] of activeRanges) {
            activeRanges.set(id, current + ' ');
          }
        } else if (tagName === 't') {
          const text = el.textContent ?? '';
          for (const [id, current] of activeRanges) {
            activeRanges.set(id, current + text);
          }
        } else if (tagName === 'commentrangeend') {
          const id = el.getAttribute('w:id') ?? el.getAttributeNS(ns, 'id') ?? '';
          if (id && activeRanges.has(id)) {
            const clean = (activeRanges.get(id) ?? '').replace(/\s+/g, ' ').trim();
            result.set(id, clean);
            activeRanges.delete(id);
          }
        }

        node = walker.nextNode();
      }
    } catch (e) {
      console.error('Failed to parse document.xml for comment ranges:', e);
    }
    return result;
  }
  /**
   * Wraps anchored text ranges in the raw mammoth HTML with
   * <mark class="cmt-anchor" id="cmt-anchor-{id}"> so they are
   * visible and scrollable in the document viewer.
   */
  private injectCommentHighlights(
    html: string,
    ranges: Map<string, string>,
    idColorMap: Map<string, number>
  ): { html: string; anchorMap: Map<string, string> } {
    let out = html;
    const anchorMap = new Map<string, string>();
    const textAnchorFallback = new Map<string, string>();

    const normKey = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

    for (const [id, rawText] of ranges) {
      const text = rawText.trim();
      if (!text) continue;

      const textKey = normKey(text);

      // mammoth HTML-encodes &, <, > in text content
      const esc = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      if (!esc.trim()) continue;

      const c = idColorMap.get(id) ?? 0;
      const anchorDomId = `cmt-anchor-${id}`;
      const mark = (matched: string) =>
        `<mark class="cmt-anchor cmt-c${c}" id="${anchorDomId}">${matched}</mark>`;

      // Try 1: literal escaped match
      const exactRe = new RegExp(esc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const exactReplaced = this.replaceFirstOutsideExistingAnchors(out, exactRe, mark);
      if (exactReplaced !== null) {
        out = exactReplaced;
        anchorMap.set(id, anchorDomId);
        if (!textAnchorFallback.has(textKey)) textAnchorFallback.set(textKey, anchorDomId);
        continue;
      }

      // Try 2: flexible — allow up to 80 chars of HTML tags between words
      //         (handles runs split by <strong>, <em>, etc.)
      const words = esc
        .split(/\s+/).filter(Boolean)
        .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (words.length > 1) {
        const flexRe = new RegExp(words.join('(?:[\\s\\S]{0,80}?)'));
        const replaced = this.replaceFirstOutsideExistingAnchors(out, flexRe, (m) => mark(m));
        if (replaced !== null) {
          out = replaced;
          anchorMap.set(id, anchorDomId);
          if (!textAnchorFallback.has(textKey)) textAnchorFallback.set(textKey, anchorDomId);
          continue;
        }
      }

      // For nested/overlapping ranges with identical text, multiple IDs can point
      // to the same visual anchor when a second independent <mark> cannot be inserted.
      const fallbackAnchor = textAnchorFallback.get(textKey);
      if (fallbackAnchor) {
        anchorMap.set(id, fallbackAnchor);
      }
    }
    return { html: out, anchorMap };
  }

  private replaceFirstOutsideExistingAnchors(
    html: string,
    pattern: RegExp,
    replacer: (matched: string) => string
  ): string | null {
    const anchorBlock = /(<mark\b[^>]*\bcmt-anchor\b[^>]*>[\s\S]*?<\/mark>)/gi;
    const parts = html.split(anchorBlock);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] ?? '';
      if (!part || i % 2 === 1) continue;

      pattern.lastIndex = 0;
      const match = pattern.exec(part);
      if (!match || match.index < 0) continue;

      const start = match.index;
      const end = start + match[0].length;
      const replacement = replacer(match[0]);
      parts[i] = part.slice(0, start) + replacement + part.slice(end);
      return parts.join('');
    }

    return null;
  }

  private parseCommentsXml(
    xml: string,
    relationMap: Map<string, { parentId?: string }>
  ): DocComment[] {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'application/xml');
    const ns     = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const nsW14  = 'http://schemas.microsoft.com/office/word/2010/wordml';

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
      const pNodes = [
        ...Array.from(el.getElementsByTagNameNS(ns, 'p')),
        ...Array.from(el.getElementsByTagName('w:p')),
      ];
      const paraSeen = new Set<Node>();
      const uniqueP = pNodes.filter(n => { if (paraSeen.has(n)) return false; paraSeen.add(n); return true; });

      let matchedParaId: string | undefined;
      let parentParaId: string | undefined;
      for (const p of uniqueP) {
        const paraId = p.getAttribute('w14:paraId') ?? p.getAttributeNS(nsW14, 'paraId') ?? '';
        if (!paraId) continue;
        if (!relationMap.has(paraId)) continue;
        matchedParaId = paraId;
        parentParaId = relationMap.get(paraId)?.parentId;
        break;
      }

      return {
        id    : el.getAttribute('w:id')     ?? el.getAttributeNS(ns, 'id')     ?? '',
        author: el.getAttribute('w:author') ?? el.getAttributeNS(ns, 'author') ?? 'Unknown',
        date  : el.getAttribute('w:date')   ?? el.getAttributeNS(ns, 'date')   ?? '',
        text,
        paraId: matchedParaId,
        parentParaId,
        colorIdx: 0,  // filled in by parseDocx after author assignment
      } as DocComment;
    }).filter(c => !!c.id);
  }

  private buildDocCommentThreads(comments: DocComment[]): DocCommentThread[] {
    if (!comments.length) return [];

    const byParaId = new Map<string, DocComment>();
    for (const c of comments) {
      if (c.paraId) byParaId.set(c.paraId, c);
    }

    const resolveRoot = (comment: DocComment): DocComment | undefined => {
      if (!comment.parentParaId) return comment;
      let current = comment.parentParaId;
      const seen = new Set<string>();

      while (current && !seen.has(current)) {
        seen.add(current);
        const parent = byParaId.get(current);
        if (!parent) return undefined;
        if (!parent.parentParaId) return parent;
        current = parent.parentParaId;
      }

      return undefined;
    };

    const threads: DocCommentThread[] = [];
    const threadByRootId = new Map<string, DocCommentThread>();

    const ensureThread = (root: DocComment): DocCommentThread => {
      const existing = threadByRootId.get(root.id);
      if (existing) return existing;
      const created: DocCommentThread = { root, replies: [] };
      threadByRootId.set(root.id, created);
      threads.push(created);
      return created;
    };

    for (const c of comments) {
      if (c.parentParaId) {
        const root = resolveRoot(c);
        if (root && root.id !== c.id) {
          const thread = ensureThread(root);
          thread.replies.push(c);
          continue;
        }
      }
      ensureThread(c);
    }

    return threads;
  }

  private flattenDocCommentThreads(threads: DocCommentThread[]): DocComment[] {
    const flat: DocComment[] = [];
    for (const thread of threads) {
      flat.push(thread.root, ...thread.replies);
    }
    return flat;
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
      document.querySelectorAll('.docx-cmt-hit')
        .forEach(el => {
          el.classList.remove(
            'docx-cmt-hit',
            'docx-cmt-hit-c0',
            'docx-cmt-hit-c1',
            'docx-cmt-hit-c2',
            'docx-cmt-hit-c3',
            'docx-cmt-hit-c4',
            'docx-cmt-hit-c5',
            'docx-cmt-hit-c6',
            'docx-cmt-hit-c7',
          );
        });

      const anchor = document.getElementById('cmt-anchor-' + id);
      if (!anchor) return;

      anchor.classList.add('active-anchor');
      anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const colorIdx = this.docComments.find(c => c.id === id)?.colorIdx ?? 0;
      const endAnchor = document.getElementById('cmt-anchor-end-' + id);

      if (endAnchor) {
        const hitCount = this.highlightRangeBetweenAnchors(anchor, endAnchor, colorIdx);
        if (hitCount > 0) return;
      }

      const target = this.findFirstTextElementAfterAnchor(anchor);
      if (!target) return;
      target.classList.add('docx-cmt-hit', `docx-cmt-hit-c${colorIdx}`);
    }, 50);
  }

  private highlightRangeBetweenAnchors(start: HTMLElement, end: HTMLElement, colorIdx: number): number {
    const container = this.docxContainer?.nativeElement;
    if (!container) return 0;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const elements = new Set<HTMLElement>();
    let node: Node | null = walker.nextNode();

    while (node) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) {
        node = walker.nextNode();
        continue;
      }

      const afterStart = !!(start.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
      const beforeEnd = !!(node.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (afterStart && beforeEnd) {
        const el = node.parentElement as HTMLElement | null;
        if (el) elements.add(el);
      }

      node = walker.nextNode();
    }

    for (const el of elements) {
      el.classList.add('docx-cmt-hit', `docx-cmt-hit-c${colorIdx}`);
    }
    return elements.size;
  }

  private findFirstTextElementAfterAnchor(anchor: HTMLElement): HTMLElement | null {
    const container = this.docxContainer?.nativeElement;
    if (!container) return null;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    walker.currentNode = anchor;

    let node: Node | null = walker.nextNode();
    while (node) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text) {
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
    let globalIdx = 0;

    for (const t of this.docCommentThreadsInternal) {
      const rootIdx = globalIdx;
      globalIdx += 1;
      const replies = t.replies.map((dc) => {
        const item = { dc, idx: globalIdx };
        globalIdx += 1;
        return item;
      });
      threads.push({ root: t.root, rootIdx, replies });
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
