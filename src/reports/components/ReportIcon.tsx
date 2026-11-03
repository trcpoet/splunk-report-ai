import {
    Activity, Banknote, BrickWallFire, Bug, ChartLine, ClipboardCheck, ClockAlert, Cloud, CloudAlert, Container, Cpu,
    CreditCard, Database, DatabaseZap, Earth, FileChartColumnIncreasing, FileLock, FileText, Gauge, Globe, GlobeLock,
    HardDrive, HeartPulse, KeyRound, Landmark, Layers, Mail, MailWarning, MapPin, MemoryStick, Network, PlugZap, RadioTower,
    Radar, ReceiptText, Route, Scale, ScanSearch, ScrollText, Server, ServerCrash, Shield, ShieldAlert, ShieldCheck,
    ShoppingCart, Siren, Timer, TrendingUp, UserCog, UserLock, UsersRound, Webhook, WifiOff, Workflow,
    type LucideIcon,
} from 'lucide-react';
import type { IconName } from '@/reports/icons';

// Each name in src/reports/icons.ts with its Lucide component. Imported one
// by one, so only these icons ship to the browser, not all of Lucide.
const ICONS = {
    'shield': Shield,
    'shield-alert': ShieldAlert,
    'shield-check': ShieldCheck,
    'key-round': KeyRound,
    'user-lock': UserLock,
    'user-cog': UserCog,
    'brick-wall-fire': BrickWallFire,
    'globe-lock': GlobeLock,
    'radar': Radar,
    'bug': Bug,
    'mail-warning': MailWarning,
    'file-lock': FileLock,
    'scan-search': ScanSearch,
    'activity': Activity,
    'server-crash': ServerCrash,
    'globe': Globe,
    'timer': Timer,
    'gauge': Gauge,
    'route': Route,
    'workflow': Workflow,
    'siren': Siren,
    'container': Container,
    'clock-alert': ClockAlert,
    'heart-pulse': HeartPulse,
    'webhook': Webhook,
    'server': Server,
    'hard-drive': HardDrive,
    'cpu': Cpu,
    'memory-stick': MemoryStick,
    'radio-tower': RadioTower,
    'database': Database,
    'database-zap': DatabaseZap,
    'network': Network,
    'cloud': Cloud,
    'cloud-alert': CloudAlert,
    'wifi-off': WifiOff,
    'plug-zap': PlugZap,
    'layers': Layers,
    'trending-up': TrendingUp,
    'credit-card': CreditCard,
    'banknote': Banknote,
    'receipt-text': ReceiptText,
    'shopping-cart': ShoppingCart,
    'users-round': UsersRound,
    'chart-line': ChartLine,
    'landmark': Landmark,
    'clipboard-check': ClipboardCheck,
    'scale': Scale,
    'scroll-text': ScrollText,
    'earth': Earth,
    'map-pin': MapPin,
    'mail': Mail,
    'file-text': FileText,
    'file-chart-column-increasing': FileChartColumnIncreasing,
} satisfies Record<IconName, LucideIcon>;

// A report's icon in a small tile, beside its category. Decorative: the title
// next to it already says what the report is.
const ReportIcon = ({ name, size = 'small' }: { name: IconName; size?: 'small' | 'large' }) => {
    // Report data should only hold listed names, but one that slipped through
    // shows the default icon instead of breaking the whole list of cards.
    const Icon = (ICONS as Partial<Record<string, LucideIcon>>)[name] ?? FileChartColumnIncreasing;
    return (
        <span className={size === 'large' ? 'report-icon report-icon-large' : 'report-icon'} aria-hidden="true">
            <Icon strokeWidth={1.75} />
        </span>
    );
};

export default ReportIcon;
