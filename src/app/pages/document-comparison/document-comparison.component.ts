import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface ContractStatus {
  valid:    number;
  notValid: number;
  total:    number;
}

interface ContractWeek {
  monday:    number;
  tuesday:   number;
  wednesday: number;
  thursday:  number;
  friday:    number;
  saturday:  number;
  sunday:    number;
}

interface SummaryCard {
  icon: string;
  iconImg: string;
  label: string;
  value: number;
  sublabel: string;
  iconColor: string;
  borderColor: string;
  cardBg: string;
}

interface MissingClause {
  topik:  string;
  count:  number;
  color:  string;
  cardBg: string;
}

interface RiskBreakdown {
  safe:     number;  // > 75%
  warning:  number;  // 60–75%
  critical: number;  // ≤ 59%
}

@Component({
  selector: 'app-document-comparison',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-comparison.component.html',
  styleUrl: './document-comparison.component.css'
})
export class DocumentComparisonComponent implements AfterViewInit, OnDestroy {
  @ViewChild('donutChart')     donutRef!:     ElementRef<HTMLCanvasElement>;
  @ViewChild('barChart')       barRef!:       ElementRef<HTMLCanvasElement>;
  @ViewChild('hbarChart')      hbarRef!:      ElementRef<HTMLCanvasElement>;

  private charts: Chart[] = [];

  contractStatus: ContractStatus = { valid: 0, notValid: 0, total: 0 };
  riskBreakdown: RiskBreakdown   = { safe: 0, warning: 0, critical: 0 };
  todayLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  constructor(private http: HttpClient, private router: Router) {}

  // summaryCards: SummaryCard[] = [
  //   { icon: 'docs',  iconImg: 'assets/Icon/Content/columns-01.png',     label: 'Word files analysed',   value: 204, sublabel: 'Total Comparison', iconColor: '#2563EB', borderColor: '#DBEAFE', cardBg: '#EFF6FF' },
  //   { icon: 'check', iconImg: 'assets/Icon/Content/file-check-02.png',  label: 'No changes detected',   value: 156, sublabel: 'Final Result',      iconColor: '#10B981', borderColor: '#D1FAE5', cardBg: '#F0FDF4' },
  //   { icon: 'alert', iconImg: 'assets/Icon/Content/file-search-02.png',         label: 'Changes detected',       value: 48,  sublabel: 'In Progress',       iconColor: '#EC861D', borderColor: '#FEF3C7', cardBg: '#FFFBEB' },
  //   { icon: 'trend', iconImg: 'assets/Icon/Content/trend-up-01.png',    label: 'Completion percentage', value: 76,  sublabel: 'Success Rate',       iconColor: '#06B6D4', borderColor: '#CFFAFE', cardBg: '#ECFEFF' },
  // ];

  missingClauses: MissingClause[] = [];

  private readonly rankColors = [
    { color: '#EF4444', cardBg: 'rgba(239,68,68,0.07)'   },
    { color: '#F97316', cardBg: 'rgba(249,115,22,0.07)'  },
    { color: '#F59E0B', cardBg: 'rgba(245,158,11,0.07)'  },
    { color: '#EAB308', cardBg: 'rgba(234,179,8,0.07)'   },
    { color: '#22C55E', cardBg: 'rgba(34,197,94,0.07)'   },
  ];

  ngAfterViewInit(): void {
    this.fetchRiskBreakdown();
    this.fetchWeekData();
    this.fetchMissingClauses();
    this.buildHorizontalBarChart();
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c.destroy());
  }

  private buildDonutChart(): void {
    const canvas = this.donutRef.nativeElement;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    const { safe, warning, critical } = this.riskBreakdown;
    const chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Critical', 'Warning', 'Safe'],
        datasets: [{
          data: [critical, warning, safe],
          backgroundColor: ['#EF4444', '#F97316', '#10B981'],
          borderWidth: 6,
          borderColor: '#ffffff',
          borderRadius: 20,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '80%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
        },
        onClick: () => { this.router.navigate(['/comparison/verification-history']); }
      }
    });
    this.charts.push(chart);
  }

  private fetchRiskBreakdown(): void {
    // Step 1: get totals for the centre label
    this.http.get<{ success: boolean; data: ContractStatus }>('/api/contractAI/count-status').subscribe({
      next: (statusRes) => {
        if (statusRes.success) this.contractStatus = statusRes.data;
        const pageSize = Math.max(this.contractStatus.total, 1);

        // Step 2: fetch all contracts to bucket by score
        this.http.get<{ data: { persentase: string | null }[] }>(
          `/api/contractAI/getlist?pageNumber=1&pageSize=${pageSize}`
        ).subscribe({
          next: (listRes) => {
            const b: RiskBreakdown = { safe: 0, warning: 0, critical: 0 };
            (listRes.data ?? []).forEach(item => {
              const pct = parseInt(item.persentase ?? '0', 10) || 0;
              if (pct === 100)    b.safe++;
              else if (pct >= 75) b.warning++;
              else                b.critical++;
            });
            this.riskBreakdown = b;
            this.buildDonutChart();
          },
          error: () => { this.buildDonutChart(); }
        });
      },
      error: () => { this.buildDonutChart(); }
    });
  }

  goContractList(): void {
    this.router.navigate(['/comparison/verification-history']);
  }

  private fetchMissingClauses(): void {
    this.http.get<{ success: boolean; data: { topik: string; count: number }[] }>('/api/contractAI/get5most-missing').subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.missingClauses = res.data.slice(0, 5).map((item, i) => ({
            topik:  item.topik,
            count:  item.count,
            color:  this.rankColors[i]?.color  ?? '#94A3B8',
            cardBg: this.rankColors[i]?.cardBg ?? 'rgba(148,163,184,0.07)',
          }));
        }
      },
      error: () => { this.missingClauses = []; }
    });
  }

  private fetchWeekData(): void {
    this.http.get<{ success: boolean; data: ContractWeek }>('/api/contractAI/countweek').subscribe({
      next: (res) => { this.buildLineChart(res.success ? res.data : null); },
      error: ()    => { this.buildLineChart(null); }
    });
  }

  private buildLineChart(week: ContractWeek | null): void {
    const values = week
      ? [week.monday, week.tuesday, week.wednesday, week.thursday, week.friday, week.saturday, week.sunday]
      : [0, 0, 0, 0, 0, 0, 0];

    const canvas   = this.barRef.nativeElement;
    const ctx      = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, 'rgba(249,115,22,0.35)');
    gradient.addColorStop(1, 'rgba(249,115,22,0.00)');

    // Custom plugin: vertical dashed crosshair + dot on hover
    const crosshairPlugin = {
      id: 'crosshair',
      afterDraw(chartInstance: Chart) {
        const activeElements = (chartInstance as any)._active;
        if (!activeElements || activeElements.length === 0) return;
        const el = activeElements[0];
        const c  = chartInstance.ctx;
        const x  = el.element.x;
        const topY    = chartInstance.chartArea.top;
        const bottomY = chartInstance.chartArea.bottom;

        // dashed vertical line
        c.save();
        c.beginPath();
        c.setLineDash([5, 4]);
        c.moveTo(x, topY);
        c.lineTo(x, bottomY);
        c.strokeStyle = '#94A3B8';
        c.lineWidth   = 1;
        c.stroke();

        // dot on the line
        const y = el.element.y;
        c.beginPath();
        c.setLineDash([]);
        c.arc(x, y, 5, 0, Math.PI * 2);
        c.fillStyle   = '#F97316';
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth   = 2;
        c.stroke();
        c.restore();
      }
    };

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
        datasets: [{
          label: 'Verified Contract',
          data: values,
          borderColor: '#F97316',
          backgroundColor: gradient,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.45,
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1E293B',
            titleColor: '#F1F5F9',
            bodyColor: '#CBD5E1',
            padding: 12,
            cornerRadius: 8,
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            displayColors: true,
            boxWidth: 10,
            boxHeight: 10,
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.y} Contract`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: '#64748B', font: { size: 11 } }
          },
          y: {
            grid: { color: '#F1F5F9' },
            border: { display: false },
            ticks: { color: '#94A3B8', font: { size: 11 }, stepSize: 1, precision: 0 },
            beginAtZero: true,
          }
        }
      },
      plugins: [crosshairPlugin]
    });
    this.charts.push(chart);
  }

  private buildHorizontalBarChart(): void {
    const barColors = ['#22C55E', '#EF4444', '#3B82F6', '#8B5CF6'];

    // sort descending so highest value appears at top
    const raw = [
      { label: 'PT BANK INDONESIA TBK',           value: 1 },
      { label: 'PT MITRA TRANSAKSI INDONESIA',    value: 2 },
      { label: 'PT BANK CONSTRUCTION',            value: 3 },
      { label: 'PT SANJAYA AMAR PERSADA',         value: 1 },
    ].sort((a, b) => b.value - a.value);

    const labels = raw.map(r => r.label);
    const values = raw.map(r => r.value);
    const colors = raw.map((_, i) => barColors[i % barColors.length]);

    // Inline plugin: draws the value label at the end of each bar
    const dataLabelPlugin = {
      id: 'hbarDataLabels',
      afterDatasetsDraw(chart: Chart) {
        const { ctx, data } = chart;
        const dataset = data.datasets[0];
        const meta    = chart.getDatasetMeta(0);
        ctx.save();
        meta.data.forEach((bar, i) => {
          const value    = dataset.data[i] as number;
          const barEl    = bar as any;
          const x        = barEl.x;          // right edge of bar
          const y        = barEl.y;          // vertical centre
          const barColor = Array.isArray(dataset.backgroundColor)
            ? (dataset.backgroundColor as string[])[i]
            : (dataset.backgroundColor as string);
          ctx.font         = 'bold 11px Manrope, Inter, sans-serif';
          ctx.fillStyle    = barColor;
          ctx.textAlign    = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(value), x + 6, y);
        });
        ctx.restore();
      }
    };

    const chart = new Chart(this.hbarRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Count',
          data: values,
          backgroundColor: colors,
          borderRadius: 2,
          barThickness: 20,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: 36 } }, // room for the label text after bar
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }        // hide hover tooltip since values are always visible
        },
        scales: {
          x: {
            grid: { color: '#F1F5F9', drawOnChartArea: true },
            border: { display: false },
            ticks: { color: '#64748B', font: { size: 11 } },
            beginAtZero: true
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: (ctx) => barColors[ctx.index % barColors.length],
              font: { size: 11 }
            }
          }
        }
      },
      plugins: [dataLabelPlugin]
    });
    this.charts.push(chart);
  }

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

  get validPct(): number {
    return this.contractStatus.total > 0
      ? Math.round((this.contractStatus.valid / this.contractStatus.total) * 100)
      : 0;
  }

  getGaugeDash(value: number): string {
    const circumference = Math.PI * 50;
    const filled = (value / 100) * circumference;
    return `${filled} ${circumference - filled}`;
  }

  getGaugeRelDash(value: number, max: number): string {
    const circumference = Math.PI * 50;
    const ratio  = max > 0 ? value / max : 0;
    const filled = ratio * 0.85 * circumference; // cap at 85% so even top has a gap
    return `${filled} ${circumference - filled}`;
  }

  getSummaryIcon(icon: string): string {
    const map: Record<string, string> = {
      docs:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
      check: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 13 11 15 15 11"/></svg>`,
      alert: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
      trend: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
    };
    return map[icon] ?? '';
  }
}
