import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

// ─────────────────────────── Interfaces ───────────────────────────

export interface StatCard {
  label: string;
  value: string;
  sub: string;
  subClass: string;
  valueClass?: string;
}

export interface ResourceProcess {
  name: string;
  value: number;
}

export interface ServerCard {
  id: string;
  name: string;
  status: 'Healthy' | 'Warning' | 'Critical';
  ram: number;
  cpu: number;
  storage: number;
  topCpu: ResourceProcess[];
  topRam: ResourceProcess[];
  topStorage: ResourceProcess[];
}

export interface ServiceHealth {
  name: string;
  cpu: number;
  dot: 'green' | 'yellow' | 'red';
}

export interface AlertItem {
  level: 'CRIT' | 'WARN' | 'INFO';
  title: string;
  desc: string;
  time: string;
}

export interface LogEntry {
  time: string;
  level: 'ERROR' | 'WARN' | 'INFO';
  service: string;
  msg: string;
}

export interface Ticket {
  id: string;
  title: string;
  priority: string;
  assignee: string;
  time: string;
  status: 'Open' | 'In progress' | 'Resolved';
}

export interface PlaybookItem {
  icon: string;
  title: string;
  desc: string;
  status: 'Running' | 'Done' | 'Standby';
}

export interface ChartPoint {
  t: string;
  p95: number;
  p50: number;
  p5: number;
}

// ─────────────────────────── Component ───────────────────────────

@Component({
  selector: 'app-ai-ops',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-ops.component.html',
  styleUrl: './ai-ops.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiOpsComponent implements OnInit, OnDestroy {

  // ── Clock ──
  currentTime = '';
  private clockInterval?: ReturnType<typeof setInterval>;

  // ── Header ──
  readonly lastSync = '14:22:08';

  // ── Network ──
  readonly icmpStatus   = 'No downtime or packet loss detected';
  readonly avgLatency   = '10.86 ms';
  readonly latencyDelta = '+2.3%';

  // ── Stat Cards ──
  readonly statCards: StatCard[] = [
    { label: 'Server uptime', value: '99.8%', sub: '↑ SLA 99.5% terpenuhi',  subClass: 'text-green-600' },
    { label: 'CPU rata-rata', value: '72%',   sub: '↑ +14% dari 1 jam lalu', subClass: 'text-green-600' },
    { label: 'Memory usage',  value: '58%',   sub: 'Stabil',                  subClass: 'text-slate-500' },
    { label: 'Active alerts', value: '7',     sub: '3 critical · 4 warning',  subClass: 'text-red-500',  valueClass: 'text-red-500' },
  ];

  // ── Service Health ──
  readonly services: ServiceHealth[] = [
    { name: 'api-gateway',        cpu: 45, dot: 'green'  },
    { name: 'order-service',      cpu: 78, dot: 'yellow' },
    { name: 'user-service',       cpu: 32, dot: 'green'  },
    { name: 'payment-service',    cpu: 91, dot: 'red'    },
    { name: 'notification-svc',   cpu: 28, dot: 'green'  },
    { name: 'inventory-service',  cpu: 66, dot: 'yellow' },
  ];

  // ── Response Time Chart ──
  readonly chartData: ChartPoint[] = [
    { t: '15:43', p95: 210,  p50: 198, p5: 185 },
    { t: '15:53', p95: 280,  p50: 205, p5: 190 },
    { t: '16:03', p95: 420,  p50: 215, p5: 195 },
    { t: '16:13', p95: 680,  p50: 220, p5: 200 },
    { t: '16:23', p95: 980,  p50: 230, p5: 205 },
    { t: '16:33', p95: 1320, p50: 245, p5: 210 },
  ];

  // Precomputed SVG polyline points (W=540 H=180, max=1400)
  readonly chartW = 540;
  readonly chartH = 180;
  readonly chartMaxY = 1400;

  chartPoints(key: keyof ChartPoint): string {
    const n = this.chartData.length;
    return this.chartData
      .map((d, i) => {
        const x = (i / (n - 1)) * this.chartW;
        const y = this.chartH - ((d[key] as number) / this.chartMaxY) * this.chartH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  chartXLabels(): { x: number; label: string }[] {
    const n = this.chartData.length;
    return this.chartData.map((d, i) => ({
      x: (i / (n - 1)) * this.chartW,
      label: d.t,
    }));
  }

  // ── Error Rate Chart ──
  readonly errorRateData = [
    { service: 'api-gw',    rate: 0.2, color: '#22c55e' },
    { service: 'order',     rate: 1.4, color: '#d97706' },
    { service: 'user',      rate: 0.1, color: '#22c55e' },
    { service: 'payment',   rate: 4.8, color: '#ef4444' },
    { service: 'notif',     rate: 0.0, color: '#22c55e' },
    { service: 'inventory', rate: 0.9, color: '#d97706' },
  ];
  readonly errorMaxRate = 6; // Y axis max %

  errorBarHeight(rate: number): number {
    return Math.max(2, (rate / this.errorMaxRate) * 100); // % of container
  }

  // ── Active Alerts ──
  readonly alerts: AlertItem[] = [
    { level: 'CRIT', title: 'High CPU — payment-service',       desc: 'pod/payment-7d9f · node: worker-03',  time: '2m ago'  },
    { level: 'CRIT', title: 'DB connection timeout',            desc: 'order-db-primary · 47 failed conn',   time: '5m ago'  },
    { level: 'WARN', title: 'Disk usage 81% — worker-02',       desc: '/var/log · threshold 80%',            time: '12m ago' },
    { level: 'INFO', title: 'Deploy selesai — user-service v2.3.1', desc: '0 error · rollout 100%',          time: '18m ago' },
  ];

  alertLevelClass(level: AlertItem['level']): string {
    const map: Record<AlertItem['level'], string> = {
      CRIT: 'bg-red-100 text-red-800',
      WARN: 'bg-yellow-100 text-yellow-800',
      INFO: 'bg-blue-100 text-blue-800',
    };
    return map[level];
  }

  // ── Live Log Stream ──
  readonly logs: LogEntry[] = [
    { time: '14:22:07', level: 'ERROR', service: 'payment-service',   msg: 'Connection timeout: db.order-primary:5432 after 30000ms' },
    { time: '14:22:05', level: 'WARN',  service: 'order-service',     msg: 'Queue depth 2847 — consumer lag growing' },
    { time: '14:22:01', level: 'INFO',  service: 'api-gateway',       msg: 'Rate limit hit: client_id=app_82f3 — 1200 req/min' },
    { time: '14:21:58', level: 'ERROR', service: 'payment-service',   msg: 'SQLSTATE[HY000]: Lost connection to MySQL server' },
    { time: '14:21:55', level: 'WARN',  service: 'inventory-service', msg: 'Response time 1842ms — SLA threshold 1000ms' },
    { time: '14:21:49', level: 'INFO',  service: 'user-service',      msg: 'Deploy v2.3.1 complete — 3 replicas healthy' },
    { time: '14:21:44', level: 'ERROR', service: 'payment-service',   msg: 'Retry 3/3 failed — circuit breaker OPEN' },
    { time: '14:21:40', level: 'WARN',  service: 'worker-02',         msg: 'Disk /var/log at 81% — cleanup triggered' },
    { time: '14:21:33', level: 'INFO',  service: 'api-gateway',       msg: 'Health check OK — all upstream services reachable' },
  ];

  readonly logFilters = ['ALL', 'ERROR', 'WARN', 'INFO'] as const;
  activeLogFilter: 'ALL' | 'ERROR' | 'WARN' | 'INFO' = 'ALL';

  get filteredLogs(): LogEntry[] {
    if (this.activeLogFilter === 'ALL') return this.logs;
    return this.logs.filter(l => l.level === this.activeLogFilter);
  }

  setLogFilter(f: typeof this.logFilters[number]): void {
    this.activeLogFilter = f;
  }

  logLevelClass(level: LogEntry['level']): string {
    const map: Record<LogEntry['level'], string> = {
      ERROR: 'text-red-500',
      WARN:  'text-yellow-500',
      INFO:  'text-blue-400',
    };
    return map[level];
  }

  // ── Ticketing ──
  readonly tickets: Ticket[] = [
    { id: 'OPS-281', title: 'payment-service — high CPU & DB timeout',  priority: 'P1', assignee: 'Reza D.',  time: '5m ago',  status: 'Open'        },
    { id: 'OPS-279', title: 'Kafka broker unreachable — order-service',  priority: 'P2', assignee: 'Siti A.', time: '22m ago', status: 'In progress'  },
    { id: 'OPS-277', title: 'Disk usage spike — worker-02',              priority: 'P3', assignee: 'AI bot',  time: '35m ago', status: 'In progress'  },
    { id: 'OPS-274', title: 'Memory leak — inventory-service v2.1',      priority: 'P2', assignee: 'Budi S.', time: '2h ago',  status: 'Resolved'     },
  ];

  ticketStatusClass(status: Ticket['status']): string {
    const map: Record<Ticket['status'], string> = {
      'Open':        'border-red-400 text-red-600',
      'In progress': 'border-yellow-400 text-yellow-600',
      'Resolved':    'border-green-400 text-green-600',
    };
    return map[status];
  }

  // ── AI Playbook ──
  readonly playbook: PlaybookItem[] = [
    { icon: '⚙️', title: 'High CPU auto-remediation', desc: 'Triggered by OPS-281 · scale-out worker', status: 'Running' },
    { icon: '🗄️', title: 'DB connection recovery',    desc: 'Retry pool reset · failover check',       status: 'Running' },
    { icon: '🗑️', title: 'Disk cleanup automation',   desc: 'Completed OPS-277 · freed 12 GB',         status: 'Done'    },
    { icon: '🔄', title: 'Pod restart on OOM',         desc: 'Standby · threshold: mem > 90%',          status: 'Standby' },
    { icon: '🔌', title: 'Kafka reconnect handler',    desc: 'Standby · linked OPS-279',                status: 'Standby' },
  ];

  playbookStatusClass(status: PlaybookItem['status']): string {
    const map: Record<PlaybookItem['status'], string> = {
      Running: 'bg-green-100 text-green-700',
      Done:    'bg-slate-100 text-slate-500',
      Standby: 'bg-slate-100 text-slate-500',
    };
    return map[status];
  }

  // ── Servers ──
  readonly servers: ServerCard[] = [
    {
      id: 'web-server-01', name: 'web-server-01', status: 'Warning',
      ram: 85, cpu: 78, storage: 25,
      topCpu:     [{ name: 'NET', value: 45 }, { name: 'Apache', value: 32 }, { name: 'IIS', value: 32 }],
      topRam:     [{ name: 'Apache', value: 84 }, { name: 'IIS', value: 82 }, { name: 'NET', value: 81 }],
      topStorage: [{ name: 'NET', value: 45 }, { name: 'Apache', value: 32 }, { name: 'IIS', value: 32 }],
    },
    {
      id: 'web-server-02', name: 'web-server-02', status: 'Healthy',
      ram: 34, cpu: 42, storage: 31,
      topCpu:     [{ name: 'NET', value: 45 }, { name: 'Apache', value: 32 }, { name: 'IIS', value: 32 }],
      topRam:     [{ name: 'IIS', value: 24 }, { name: 'Apache', value: 18 }, { name: 'NET', value: 12 }],
      topStorage: [{ name: 'IIS', value: 43 }, { name: 'NET', value: 36 }, { name: 'Apache', value: 32 }],
    },
    {
      id: 'db-server-01', name: 'db-server-01', status: 'Critical',
      ram: 85, cpu: 78, storage: 91,
      topCpu:     [{ name: 'IIS', value: 91 }, { name: 'Apache', value: 86 }, { name: 'NET', value: 76 }],
      topRam:     [{ name: 'Apache', value: 81 }, { name: 'IIS', value: 80 }, { name: 'NET', value: 75 }],
      topStorage: [{ name: 'NET', value: 91 }, { name: 'Apache', value: 90 }, { name: 'IIS', value: 87 }],
    },
    {
      id: 'app-server-01', name: 'app-server-01', status: 'Warning',
      ram: 85, cpu: 78, storage: 64,
      topCpu:     [{ name: 'Nginx', value: 53 }, { name: 'Tomcat', value: 51 }, { name: 'Java', value: 45 }],
      topRam:     [{ name: 'Java', value: 45 }, { name: 'Tomcat', value: 32 }, { name: 'Nginx', value: 32 }],
      topStorage: [{ name: 'Tomcat', value: 89 }, { name: 'Java', value: 80 }, { name: 'Nginx', value: 32 }],
    },
  ];

  // ── Host summary (derived) ──
  get totalHosts()     { return this.servers.length; }
  get healthyHosts()   { return this.servers.filter(s => s.status === 'Healthy').length; }
  get unhealthyHosts() { return this.servers.filter(s => s.status !== 'Healthy').length; }

  // ── Server card helpers ──
  statusBorderClass(s: ServerCard): string {
    if (s.status === 'Healthy')  return 'border-green-400';
    if (s.status === 'Critical') return 'border-red-400';
    return 'border-yellow-400';
  }

  statusBadgeClass(s: ServerCard): string {
    if (s.status === 'Healthy')  return 'bg-green-100 text-green-700';
    if (s.status === 'Critical') return 'bg-red-100 text-red-600';
    return 'bg-yellow-100 text-yellow-700';
  }

  barColor(value: number): string {
    if (value >= 85) return 'bg-red-500';
    if (value >= 60) return 'bg-yellow-400';
    return 'bg-green-400';
  }

  serviceBarColor(dot: ServiceHealth['dot']): string {
    if (dot === 'red')    return 'bg-red-500';
    if (dot === 'yellow') return 'bg-yellow-400';
    return 'bg-green-500';
  }

  serviceDotColor(dot: ServiceHealth['dot']): string {
    if (dot === 'red')    return 'bg-red-500';
    if (dot === 'yellow') return 'bg-yellow-400';
    return 'bg-green-500';
  }

  getMetrics(s: ServerCard): { label: string; value: number }[] {
    return [
      { label: 'RAM Usage',     value: s.ram     },
      { label: 'CPU Usage',     value: s.cpu     },
      { label: 'Storage Usage', value: s.storage },
    ];
  }

  hasAiRecommendation(s: ServerCard): boolean {
    return s.status !== 'Healthy';
  }

  aiRecommendationClass(s: ServerCard): string {
    if (s.status === 'Critical') return 'border-red-300 text-red-500 bg-red-50';
    return 'border-yellow-300 text-yellow-600 bg-yellow-50';
  }

  // ── Lifecycle ──
  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.updateTime();
    this.clockInterval = setInterval(() => {
      this.updateTime();
      this.cdr.markForCheck();
    }, 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.clockInterval);
  }

  private updateTime(): void {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    this.currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} WIB`;
  }
}