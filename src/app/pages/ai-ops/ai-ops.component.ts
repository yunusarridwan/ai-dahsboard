import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

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

@Component({
  selector: 'app-ai-ops',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ai-ops.component.html',
  styleUrl: './ai-ops.component.css',
})
export class AiOpsComponent implements OnInit, OnDestroy {
  /* ── Clock ── */
  currentTime = '';
  private clockInterval?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.updateTime();
    this.clockInterval = setInterval(() => this.updateTime(), 1000);
  }

  ngOnDestroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
  }

  private updateTime(): void {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    this.currentTime = `${h}:${m}:${s} WIB`;
  }

  /* ── Network ── */
  icmpStatus   = 'No downtime or packet loss detected';
  avgLatency   = '10.86 ms';
  latencyDelta = '+2.3%';

  /* ── Host summary ── */
  get totalHosts()    { return this.servers.length; }
  get healthyHosts()  { return this.servers.filter(s => s.status === 'Healthy').length; }
  get unhealthyHosts(){ return this.servers.filter(s => s.status !== 'Healthy').length; }

  /* ── Servers ── */
  servers: ServerCard[] = [
    {
      id: 'web-server-01',
      name: 'web-server-01',
      status: 'Warning',
      ram: 85, cpu: 78, storage: 25,
      topCpu:     [{ name: 'NET', value: 45 }, { name: 'Apache', value: 32 }, { name: 'IIS', value: 32 }],
      topRam:     [{ name: 'Apache', value: 84 }, { name: 'IIS', value: 82 }, { name: 'NET', value: 81 }],
      topStorage: [{ name: 'NET', value: 45 }, { name: 'Apache', value: 32 }, { name: 'IIS', value: 32 }],
    },
    {
      id: 'web-server-02',
      name: 'web-server-02',
      status: 'Healthy',
      ram: 34, cpu: 42, storage: 31,
      topCpu:     [{ name: 'NET', value: 45 }, { name: 'Apache', value: 32 }, { name: 'IIS', value: 32 }],
      topRam:     [{ name: 'IIS', value: 24 }, { name: 'Apache', value: 18 }, { name: 'NET', value: 12 }],
      topStorage: [{ name: 'IIS', value: 43 }, { name: 'NET', value: 36 }, { name: 'Apache', value: 32 }],
    },
    {
      id: 'db-server-01',
      name: 'db-server-01',
      status: 'Critical',
      ram: 85, cpu: 78, storage: 91,
      topCpu:     [{ name: 'IIS', value: 91 }, { name: 'Apache', value: 86 }, { name: 'NET', value: 76 }],
      topRam:     [{ name: 'Apache', value: 81 }, { name: 'IIS', value: 80 }, { name: 'NET', value: 75 }],
      topStorage: [{ name: 'NET', value: 91 }, { name: 'Apache', value: 90 }, { name: 'IIS', value: 87 }],
    },
    {
      id: 'app-server-01',
      name: 'app-server-01',
      status: 'Warning',
      ram: 85, cpu: 78, storage: 64,
      topCpu:     [{ name: 'Nginx', value: 53 }, { name: 'Tomcat', value: 51 }, { name: 'Java', value: 45 }],
      topRam:     [{ name: 'Java', value: 45 }, { name: 'Tomcat', value: 32 }, { name: 'Nginx', value: 32 }],
      topStorage: [{ name: 'Tomcat', value: 89 }, { name: 'Java', value: 80 }, { name: 'Nginx', value: 32 }],
    },
  ];

  /* ── Helpers ── */
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

  getMetrics(s: ServerCard): { label: string; value: number }[] {
    return [
      { label: 'RAM Usage',     value: s.ram     },
      { label: 'CPU Usage',     value: s.cpu     },
      { label: 'Storage Usage', value: s.storage },
    ];
  }

  hasAiRecommendation(s: ServerCard): boolean {
    return s.status === 'Warning' || s.status === 'Critical';
  }

  aiRecommendationClass(s: ServerCard): string {
    if (s.status === 'Critical') return 'border-red-300 text-red-500 bg-red-50';
    return 'border-yellow-300 text-yellow-600 bg-yellow-50';
  }
}
