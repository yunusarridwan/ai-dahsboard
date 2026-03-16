import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { SearchBarComponent } from '../../components/search-bar/search-bar.component';

Chart.register(...registerables);

interface ResultCard {
  label: string;
  value: number;
  color: string;
  bg: string;
  icon: string;
  image: string;
  sublabel: string;
}

interface StatCard {
  title: string;
  subtitle: string;
  value: string;
  bg: string;
  iconBg: string;
  textColor: string;
  image: string;
}

interface TechnicianCard {
  name: string;
  count: number;
  badgeColor: string;
  initials: string;
  avatarBg: string;
  image?: string;
}

interface WeeklyResponse {
  success: boolean;
  data: {
    id: string;
    createdAt: string;
    year: number;
    month: number;
    thisWeek_Monday: number;
    thisWeek_Tuesday: number;
    thisWeek_Wednesday: number;
    thisWeek_Thursday: number;
    thisWeek_Friday: number;
    thisWeek_Saturday: number;
    thisWeek_Sunday: number;
    lastWeek_Monday: number;
    lastWeek_Tuesday: number;
    lastWeek_Wednesday: number;
    lastWeek_Thursday: number;
    lastWeek_Friday: number;
    lastWeek_Saturday: number;
    lastWeek_Sunday: number;
  };
}

interface MostMissingResponse {
  success: boolean;
  data: {
    Id: string;
    CreatedAt: string;
    fields: { field: string; value: number }[];
  };
}

@Component({
  selector: 'app-document-validation',
  standalone: true,
  imports: [CommonModule, SearchBarComponent],
  templateUrl: './document-validation.component.html',
  styleUrl: './document-validation.component.css'
})
export class DocumentValidationComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('analyticsChart') analyticsChartRef!: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;

  resultCards: ResultCard[] = [
    { label: '0% Result',   value: 0, color: '#EF4444', bg: 'rgba(239,68,68,0.08)',   icon: 'cross',   image: 'assets/images/Icon 0 Result.png',   sublabel: 'NOT MATCH'     },
    { label: '20% Result',  value: 0, color: '#F97316', bg: 'rgba(249,115,22,0.08)',  icon: 'warning', image: 'assets/images/Icon 20 Result.png',  sublabel: 'LOW MATCH'     },
    { label: '40% Result',  value: 0, color: '#EAB308', bg: 'rgba(234,179,8,0.08)',   icon: 'search',  image: 'assets/images/Icon 40 Result.png',  sublabel: 'PARTIAL MATCH' },
    { label: '60% Result',  value: 0, color: '#22C55E', bg: 'rgba(34,197,94,0.08)',   icon: 'partial', image: 'assets/images/Icon 60 Result.png',  sublabel: 'MODERATE'      },
    { label: '80% Result',  value: 0, color: '#10B981', bg: 'rgba(16,185,129,0.08)',  icon: 'check',   image: 'assets/images/Icon 80 Result.png',  sublabel: 'GOOD MATCH'    },
    { label: '100% Result', value: 0, color: '#059669', bg: 'rgba(5,150,105,0.08)',   icon: 'trophy',  image: 'assets/images/Icon 100 Result.png', sublabel: 'PERFECT MATCH' },
  ];

  statCards: StatCard[] = [
    { title: 'This Week',  subtitle: 'Processed by AI', value: '—', bg: '#369fff', iconBg: 'rgba(255,255,255,0.2)', textColor: '#ffffff', image: 'assets/images/Icon per hour.png'  },
    { title: 'Today',      subtitle: 'Processed by AI', value: '—', bg: '#EC861D', iconBg: 'rgba(255,255,255,0.2)', textColor: '#ffffff', image: 'assets/images/Icon per today.png' },
    { title: 'This Month', subtitle: 'Processed by AI', value: '—', bg: '#10B981', iconBg: 'rgba(255,255,255,0.2)', textColor: '#ffffff', image: 'assets/images/Icon per month.png' },
    { title: 'This Year',  subtitle: 'Processed by AI', value: '—', bg: '#FFD043', iconBg: 'rgba(255,255,255,0.2)', textColor: '#ffffff', image: 'assets/images/Icon per year.png'  },
  ];

  private readonly API_URL             = '/api/WOD/count';
  private readonly API_RESULT_URL      = '/api/WOD/result';
  private readonly API_WEEKLY_URL      = '/api/WOD/countWeekly_Daily';
  private readonly API_MISSING_URL     = '/api/WOD/most_Missing';

  constructor(private http: HttpClient, private router: Router) {}

  todayLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  goToDetail(label: string): void {
    const score = label.split('%')[0].trim();
    this.router.navigate(['/dashboard/result', score]);
  }

  ngOnInit(): void {
    this.fetchCount();
    this.fetchResult();
    this.fetchMostMissing();
  }

  private fetchCount(): void {
    console.log('%c[WOD] 🚀 Fetching count data...', 'color:#2563EB;font-weight:bold');
    console.log(`%c[WOD] URL: ${this.API_URL}`, 'color:#64748B');
    console.time('[WOD] Count request duration');

    this.http.get<{ success: boolean; data: { id: string; createdAt: string; thisyear: number; thismonth: number; thisweek: number; today: number } }>(
      this.API_URL
    ).subscribe({
      next: (res) => {
        console.timeEnd('[WOD] Count request duration');
        console.log('%c[WOD] ✅ Count response:', 'color:#10B981;font-weight:bold', res);

        if (!res.success || !res.data) { console.warn('[WOD] Count success=false or empty'); return; }

        // API returns a single object
        const data = res.data;

        this.animateCount(0, data.thisweek,  1200, v => this.statCards[0].value = v.toLocaleString());
        this.animateCount(0, data.today,     1200, v => this.statCards[1].value = v.toLocaleString());
        this.animateCount(0, data.thismonth, 1500, v => this.statCards[2].value = v.toLocaleString());
        this.animateCount(0, data.thisyear,  1800, v => this.statCards[3].value = v.toLocaleString());

        console.log('%c[WOD] 📊 Stat cards updated:', 'color:#10B981', {
          'This Week':  data.thisweek,
          'Today':      data.today,
          'This Month': data.thismonth,
          'This Year':  data.thisyear,
        });
      },
      error: (err) => {
        console.timeEnd('[WOD] Count request duration');
        console.error('%c[WOD] ❌ Count request failed:', 'color:#EF4444;font-weight:bold', {
          status: err.status, statusText: err.statusText, message: err.message, url: err.url,
        });
      }
    });
  }

  private fetchResult(): void {
    console.log('%c[WOD] 🚀 Fetching result data...', 'color:#7C3AED;font-weight:bold');
    console.log(`%c[WOD] URL: ${this.API_RESULT_URL}`, 'color:#64748B');
    console.time('[WOD] Result request duration');

    interface ResultRow {
      id:        string;
      bucket0:   number;
      bucket20:  number;
      bucket40:  number;
      bucket60:  number;
      bucket80:  number;
      bucket100: number;
      createdAt: string;
    }

    this.http.get<{ success: boolean; data: ResultRow }>(
      this.API_RESULT_URL
    ).subscribe({
      next: (res) => {
        console.timeEnd('[WOD] Result request duration');
        console.log('%c[WOD] ✅ Result response:', 'color:#10B981;font-weight:bold', res);

        if (!res.success || !res.data) { console.warn('[WOD] Result success=false or empty'); return; }

        // API returns a single object
        const row = res.data;
        const values = [row.bucket0, row.bucket20, row.bucket40, row.bucket60, row.bucket80, row.bucket100];

        values.forEach((val, i) => {
          this.animateCount(0, val, 1400 + i * 100, v => this.resultCards[i].value = v);
        });

        console.log('%c[WOD] 📊 Result cards updated:', 'color:#10B981', {
          '0%': row.bucket0, '20%': row.bucket20, '40%': row.bucket40,
          '60%': row.bucket60, '80%': row.bucket80, '100%': row.bucket100,
        });
      },
      error: (err) => {
        console.timeEnd('[WOD] Result request duration');
        console.error('%c[WOD] ❌ Result request failed:', 'color:#EF4444;font-weight:bold', {
          status: err.status, statusText: err.statusText, message: err.message, url: err.url,
        });
      }
    });
  }

  private animateCount(from: number, to: number, duration: number, setter: (v: number) => void): void {
    if (to === 0) { setter(0); return; }
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutQuart
      const ease = 1 - Math.pow(1 - progress, 4);
      setter(Math.round(from + (to - from) * ease));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  technicianCards: TechnicianCard[] = [];

  private readonly missingImageMap: Record<string, string> = {
    'bast':            'assets/MostMissing/BAST.png',
    'edc':             'assets/MostMissing/EDC.png',
    'merchant':        'assets/MostMissing/Merchant.png',
    'mid':             'assets/MostMissing/MID.png',
    'nominal':         'assets/MostMissing/Nominal.png',
    'rollsalesdraft':  'assets/MostMissing/RollSalesDraft.png',
    'snedc':           'assets/MostMissing/SNEDC.png',
    'suratpernyataan': 'assets/MostMissing/SuratPernyataan.png',
    'tanggal':         'assets/MostMissing/Tanggal.png',
    'tid':             'assets/MostMissing/TID.png',
  };

  private readonly missingNameMap: Record<string, string> = {
    'bast':            'BAST',
    'edc':             'EDC',
    'merchant':        'Merchant',
    'mid':             'MID',
    'nominal':         'Nominal',
    'rollsalesdraft':  'Roll Sales Draft',
    'snedc':           'SN EDC',
    'suratpernyataan': 'Surat Pernyataan',
    'tanggal':         'Tanggal',
    'tid':             'TID',
  };

  private getMissingColor(value: number, max: number): { badgeColor: string; avatarBg: string; initials: string } {
    // ratio 0=lowest(safe/green) … 1=highest(dangerous/red)
    const ratio = max > 0 ? value / max : 0;
    let badgeColor: string;
    let avatarBg: string;
    if (ratio >= 0.85) {
      badgeColor = '#EF4444'; avatarBg = '#FEE2E2'; // red – most dangerous
    } else if (ratio >= 0.70) {
      badgeColor = '#F97316'; avatarBg = '#FFF0E6'; // orange
    } else if (ratio >= 0.55) {
      badgeColor = '#F59E0B'; avatarBg = '#FEF3C7'; // amber
    } else if (ratio >= 0.40) {
      badgeColor = '#EAB308'; avatarBg = '#FEFCE8'; // yellow
    } else if (ratio >= 0.25) {
      badgeColor = '#84CC16'; avatarBg = '#F7FEE7'; // lime
    } else {
      badgeColor = '#22C55E'; avatarBg = '#DCFCE7'; // green – safest
    }
    return { badgeColor, avatarBg, initials: '' };
  }

  /**
   * Dynamically converts an API key like "merchantresult" into a readable
   * display name and initials — no static mapping required.
   * Rules:
   *  1. Strip trailing "result"
   *  2. If the base is short (≤6 chars) with few vowels → treat as abbreviation → UPPERCASE
   *  3. Otherwise → Title Case the first letter
   */
  private formatApiKey(key: string): { name: string; initials: string } {
    const base = key.replace(/result$/i, '');
    const vowelCount = (base.match(/[aeiou]/gi) ?? []).length;
    const isAbbreviation = base.length <= 6 && vowelCount / base.length < 0.35;

    if (isAbbreviation) {
      const name = base.toUpperCase();
      return { name, initials: name.slice(0, 2) };
    }

    const name = base.charAt(0).toUpperCase() + base.slice(1);
    return { name, initials: base.slice(0, 2).toUpperCase() };
  }

  private fetchMostMissing(): void {
    console.log('%c[WOD] 🚀 Fetching most missing data...', 'color:#6366F1;font-weight:bold');
    console.time('[WOD] MostMissing request duration');

    this.http.get<MostMissingResponse>(this.API_MISSING_URL).subscribe({
      next: (res) => {
        console.timeEnd('[WOD] MostMissing request duration');
        console.log('%c[WOD] ✅ MostMissing response:', 'color:#10B981;font-weight:bold', res);

        if (!res.success || !res.data) { console.warn('[WOD] most_Missing success=false or empty'); return; }

        // API returns a single object with fields array
        const fields = res.data.fields;
        if (!fields?.length) { console.warn('[WOD] most_Missing fields empty'); return; }

        const max = Math.max(...fields.map(d => d.value));

        // already sorted descending by the API, but sort locally to be safe
        const sorted = [...fields].sort((a, b) => b.value - a.value);

        this.technicianCards = sorted.map(({ field, value }) => {
          const imageKey = field.replace(/result$/i, '').toLowerCase().replace(/\s+/g, '');
          const name = this.missingNameMap[imageKey] ?? this.formatApiKey(field).name;
          const { initials } = this.formatApiKey(field);
          const colors = this.getMissingColor(value, max);
          const image = this.missingImageMap[imageKey];
          return {
            name,
            count:      value,
            initials,
            badgeColor: colors.badgeColor,
            avatarBg:   colors.avatarBg,
            image,
          };
        });

        console.log('%c[WOD] 📊 Technician cards updated:', 'color:#10B981', this.technicianCards);
      },
      error: (err) => {
        console.timeEnd('[WOD] MostMissing request duration');
        console.error('%c[WOD] ❌ MostMissing request failed:', 'color:#EF4444;font-weight:bold', {
          status: err.status, statusText: err.statusText, message: err.message, url: err.url,
        });
        // fallback dummy data so UI is never empty
        // const fallback = [
        //   { name: 'Merchant',         count: 17865, initials: 'M', badgeColor: '#EF4444', avatarBg: '#FEE2E2' },
        //   { name: 'Surat Pernyataan', count: 17638, initials: 'SP', badgeColor: '#EF4444', avatarBg: '#FEE2E2' },
        //   { name: 'Rol Sales Draft',  count: 17515, initials: 'RS', badgeColor: '#F97316', avatarBg: '#FFF0E6' },
        //   { name: 'Nominal',          count: 15987, initials: 'NM', badgeColor: '#F97316', avatarBg: '#FFF0E6' },
        //   { name: 'EDC',              count: 15915, initials: 'ED', badgeColor: '#F59E0B', avatarBg: '#FEF3C7' },
        //   { name: 'MID',              count: 15638, initials: 'MI', badgeColor: '#F59E0B', avatarBg: '#FEF3C7' },
        //   { name: 'TID',              count: 15061, initials: 'TI', badgeColor: '#EAB308', avatarBg: '#FEFCE8' },
        //   { name: 'BAST',             count: 14060, initials: 'BA', badgeColor: '#84CC16', avatarBg: '#F7FEE7' },
        //   { name: 'Tanggal',          count: 13718, initials: 'TG', badgeColor: '#84CC16', avatarBg: '#F7FEE7' },
        //   { name: 'SN EDC',           count: 13567, initials: 'SE', badgeColor: '#22C55E', avatarBg: '#DCFCE7' },
        // ];
        // this.technicianCards = fallback;
        this.technicianCards = [];
      }
    });
  }

  ngAfterViewInit(): void {
    this.buildAnalyticsChart();
    this.fetchWeekly();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private fetchWeekly(): void {
    console.log('%c[WOD] 🚀 Fetching weekly data...', 'color:#059669;font-weight:bold');
    console.log(`%c[WOD] URL: ${this.API_WEEKLY_URL}`, 'color:#64748B');
    console.time('[WOD] Weekly request duration');

    this.http.get<WeeklyResponse>(this.API_WEEKLY_URL).subscribe({
      next: (res) => {
        console.timeEnd('[WOD] Weekly request duration');
        console.log('%c[WOD] ✅ Weekly response:', 'color:#10B981;font-weight:bold', res);

        if (!res.success || !res.data) { console.warn('[WOD] Weekly success=false or empty'); return; }

        // API returns a single object
        const d = res.data;
        const lastWeekData = [
          d.lastWeek_Monday, d.lastWeek_Tuesday, d.lastWeek_Wednesday,
          d.lastWeek_Thursday, d.lastWeek_Friday, d.lastWeek_Saturday, d.lastWeek_Sunday
        ];
        const thisWeekData = [
          d.thisWeek_Monday, d.thisWeek_Tuesday, d.thisWeek_Wednesday,
          d.thisWeek_Thursday, d.thisWeek_Friday, d.thisWeek_Saturday, d.thisWeek_Sunday
        ];

        if (this.chart) {
          this.chart.data.datasets[0].data = lastWeekData;
          this.chart.data.datasets[1].data = thisWeekData;
          this.chart.update();
          console.log('%c[WOD] 📊 Chart updated with weekly data:', 'color:#10B981', {
            lastWeek: lastWeekData,
            thisWeek: thisWeekData,
          });
        }
      },
      error: (err) => {
        console.timeEnd('[WOD] Weekly request duration');
        console.error('%c[WOD] ❌ Weekly request failed:', 'color:#EF4444;font-weight:bold', {
          status: err.status, statusText: err.statusText, message: err.message, url: err.url,
        });
      }
    });
  }

  private buildAnalyticsChart(): void {
    const labels = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const lastWeek  = [0, 0, 0, 0, 0, 0, 0];
    const thisWeek  = [0, 0, 0, 0, 0, 0, 0];

    // Custom crosshair plugin — draws a vertical dotted line on hover
    const crosshairPlugin = {
      id: 'crosshair',
      afterDraw(chart: Chart) {
        const active = (chart.tooltip as any)?._active;
        if (!active?.length) return;
        const x   = active[0].element.x;
        const ctx = chart.ctx;
        const top = chart.scales['y'].top;
        const bot = chart.scales['y'].bottom;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bot);
        ctx.lineWidth   = 1.5;
        ctx.strokeStyle = '#94A3B8';
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.restore();
      }
    };

    this.chart = new Chart(this.analyticsChartRef.nativeElement, {
      type: 'line',
      plugins: [crosshairPlugin],
      data: {
        labels,
        datasets: [
          {
            label: 'Last 7 days',
            data: lastWeek,
            borderColor: '#EC861D',
            backgroundColor: 'rgba(236,134,29,0.12)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#EC861D',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            borderWidth: 2,
          },
          {
            label: 'This week',
            data: thisWeek,
            borderColor: '#2563EB',
            backgroundColor: 'rgba(37,99,235,0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#2563EB',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            borderWidth: 2,
          }
        ]
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
            backgroundColor: '#1F2937',
            titleColor: '#F9FAFB',
            bodyColor: '#D1D5DB',
            padding: 10,
            cornerRadius: 8,
            displayColors: true,
            boxWidth: 10,
            boxHeight: 10,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#64748B', font: { size: 11 } },
          },
          y: {
            grid: { color: '#F1F5F9' },
            ticks: { color: '#64748B', font: { size: 11 } },
            beginAtZero: true,
          }
        }
      }
    });
  }

  getAvatarUrl(initials: string, avatarBg: string, badgeColor: string): string {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>
      <circle cx='64' cy='64' r='64' fill='${avatarBg}'/>
      <text x='64' y='64' dominant-baseline='central' text-anchor='middle'
        font-family='Manrope,Inter,sans-serif' font-size='42' font-weight='700'
        fill='${badgeColor}'>${initials}</text>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  getResultIcon(icon: string): string {
    const icons: Record<string, string> = {
      cross:   `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#FEE2E2" stroke="#EF4444" stroke-width="1.5"/><path d="M12 12l12 12M24 12L12 24" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round"/></svg>`,
      warning: `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#FEF3C7" stroke="#F97316" stroke-width="1.5"/><path d="M18 11v8M18 23v2" stroke="#F97316" stroke-width="2.5" stroke-linecap="round"/></svg>`,
      search:  `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#FEF9C3" stroke="#EAB308" stroke-width="1.5"/><circle cx="16" cy="16" r="5" stroke="#EAB308" stroke-width="2"/><path d="M20 20l4 4" stroke="#EAB308" stroke-width="2.5" stroke-linecap="round"/></svg>`,
      partial: `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#D1FAE5" stroke="#22C55E" stroke-width="1.5"/><path d="M11 18l5 5 9-9" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 24h14" stroke="#22C55E" stroke-width="1.5"/></svg>`,
      check:   `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#DCFCE7" stroke="#10B981" stroke-width="1.5"/><path d="M11 18l5 5 9-9" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      trophy:  `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="#D1FAE5" stroke="#059669" stroke-width="1.5"/><path d="M13 11h10v7a5 5 0 0 1-10 0v-7z" stroke="#059669" stroke-width="2" fill="none"/><path d="M13 14H10a3 3 0 0 0 3 3M23 14h3a3 3 0 0 1-3 3M18 23v3M15 26h6" stroke="#059669" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    };
    return icons[icon] ?? '';
  }
}
