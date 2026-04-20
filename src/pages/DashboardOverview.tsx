import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBuchungsverwaltung } from '@/lib/enrich';
import type { EnrichedBuchungsverwaltung } from '@/types/enriched';
import type { Buchungsverwaltung, Zimmerverwaltung } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BuchungsverwaltungDialog } from '@/components/dialogs/BuchungsverwaltungDialog';
import { ZimmerverwaltungDialog } from '@/components/dialogs/ZimmerverwaltungDialog';
import {
  IconAlertCircle, IconTool, IconRefresh, IconCheck,
  IconPlus, IconPencil, IconTrash, IconDoor, IconCat,
  IconCalendarCheck, IconCalendarClock, IconBuildingCottage,
  IconCurrencyEuro, IconArrowRight, IconArrowLeft,
} from '@tabler/icons-react';

const APPGROUP_ID = '69e6442ec3c6c097ba10ec18';
const REPAIR_ENDPOINT = '/claude/build/repair';

// ── Status helpers ────────────────────────────────────────────────────────────

const BUCHUNG_STATUS_COLORS: Record<string, string> = {
  anfrage: 'bg-yellow-100 text-yellow-800',
  bestaetigt: 'bg-blue-100 text-blue-800',
  eingecheckt: 'bg-green-100 text-green-800',
  ausgecheckt: 'bg-gray-100 text-gray-700',
  storniert: 'bg-red-100 text-red-700',
};

const ZIMMER_STATUS_COLORS: Record<string, string> = {
  verfuegbar: 'bg-green-100 text-green-800 border-green-200',
  belegt: 'bg-blue-100 text-blue-800 border-blue-200',
  reinigung: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  gesperrt: 'bg-red-100 text-red-700 border-red-200',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isToday(dateStr?: string): boolean {
  if (!dateStr) return false;
  return dateStr.slice(0, 10) === today();
}

function isUpcoming(dateStr?: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d > today();
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function DashboardOverview() {
  const {
    kundenverwaltung, katzenverwaltung, zimmerverwaltung, leistungsverwaltung,
    buchungsverwaltung,
    kundenverwaltungMap, katzenverwaltungMap, zimmerverwaltungMap, leistungsverwaltungMap,
    loading, error, fetchAll,
  } = useDashboardData();

  // Enrichment
  const enrichedBuchungen = enrichBuchungsverwaltung(buchungsverwaltung, {
    kundenverwaltungMap, katzenverwaltungMap, zimmerverwaltungMap, leistungsverwaltungMap,
  });

  // Dialog state
  const [buchungDialogOpen, setBuchungDialogOpen] = useState(false);
  const [editBuchung, setEditBuchung] = useState<EnrichedBuchungsverwaltung | null>(null);
  const [deleteBuchung, setDeleteBuchung] = useState<EnrichedBuchungsverwaltung | null>(null);
  const [zimmerDialogOpen, setZimmerDialogOpen] = useState(false);
  const [editZimmer, setEditZimmer] = useState<Zimmerverwaltung | null>(null);

  // Active tab: "zimmer" | "buchungen"
  const [activeTab, setActiveTab] = useState<'zimmer' | 'buchungen'>('zimmer');

  // Buchungen filter
  const [buchungFilter, setBuchungFilter] = useState<string>('alle');

  // Computed stats
  const stats = useMemo(() => {
    const aktiv = buchungsverwaltung.filter(b =>
      b.fields.buchungsstatus?.key === 'eingecheckt'
    ).length;
    const heute_anreise = buchungsverwaltung.filter(b => isToday(b.fields.anreise)).length;
    const heute_abreise = buchungsverwaltung.filter(b => isToday(b.fields.abreise)).length;
    const freieZimmer = zimmerverwaltung.filter(z => z.fields.zimmer_status?.key === 'verfuegbar').length;
    return { aktiv, heute_anreise, heute_abreise, freieZimmer };
  }, [buchungsverwaltung, zimmerverwaltung]);

  // Filtered Buchungen
  const filteredBuchungen = useMemo(() => {
    if (buchungFilter === 'alle') return enrichedBuchungen;
    if (buchungFilter === 'anreise') return enrichedBuchungen.filter(b => isToday(b.fields.anreise));
    if (buchungFilter === 'abreise') return enrichedBuchungen.filter(b => isToday(b.fields.abreise));
    if (buchungFilter === 'eingecheckt') return enrichedBuchungen.filter(b => b.fields.buchungsstatus?.key === 'eingecheckt');
    if (buchungFilter === 'upcoming') return enrichedBuchungen.filter(b => isUpcoming(b.fields.anreise) && b.fields.buchungsstatus?.key === 'bestaetigt');
    return enrichedBuchungen;
  }, [enrichedBuchungen, buchungFilter]);

  // ALL hooks BEFORE early returns
  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // CRUD handlers
  const handleCreateBuchung = async (fields: Buchungsverwaltung['fields']) => {
    await LivingAppsService.createBuchungsverwaltungEntry(fields);
    fetchAll();
  };

  const handleEditBuchung = async (fields: Buchungsverwaltung['fields']) => {
    if (!editBuchung) return;
    await LivingAppsService.updateBuchungsverwaltungEntry(editBuchung.record_id, fields);
    fetchAll();
  };

  const handleDeleteBuchung = async () => {
    if (!deleteBuchung) return;
    await LivingAppsService.deleteBuchungsverwaltungEntry(deleteBuchung.record_id);
    setDeleteBuchung(null);
    fetchAll();
  };

  const handleCreateZimmer = async (fields: Zimmerverwaltung['fields']) => {
    await LivingAppsService.createZimmerverwaltungEntry(fields);
    fetchAll();
  };

  const handleEditZimmer = async (fields: Zimmerverwaltung['fields']) => {
    if (!editZimmer) return;
    await LivingAppsService.updateZimmerverwaltungEntry(editZimmer.record_id, fields);
    fetchAll();
  };

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Eingecheckt"
          value={String(stats.aktiv)}
          description="Katzen aktuell"
          icon={<IconCat size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Anreise heute"
          value={String(stats.heute_anreise)}
          description="Buchungen"
          icon={<IconCalendarCheck size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Abreise heute"
          value={String(stats.heute_abreise)}
          description="Buchungen"
          icon={<IconCalendarClock size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Freie Zimmer"
          value={String(stats.freieZimmer)}
          description={`von ${zimmerverwaltung.length} gesamt`}
          icon={<IconBuildingCottage size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab('zimmer')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'zimmer'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <IconDoor size={15} className="shrink-0" />
            Zimmerübersicht
          </span>
        </button>
        <button
          onClick={() => setActiveTab('buchungen')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'buchungen'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <IconCalendarCheck size={15} className="shrink-0" />
            Buchungen
          </span>
        </button>
      </div>

      {/* ── Zimmerübersicht ─────────────────────────────────────────── */}
      {activeTab === 'zimmer' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base font-semibold text-foreground">Alle Zimmer</h2>
            <Button size="sm" onClick={() => { setEditZimmer(null); setZimmerDialogOpen(true); }}>
              <IconPlus size={14} className="mr-1 shrink-0" />
              Zimmer anlegen
            </Button>
          </div>

          {zimmerverwaltung.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <IconDoor size={48} stroke={1.5} />
              <p className="text-sm">Noch keine Zimmer angelegt</p>
              <Button size="sm" variant="outline" onClick={() => { setEditZimmer(null); setZimmerDialogOpen(true); }}>
                <IconPlus size={14} className="mr-1" />Zimmer anlegen
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {zimmerverwaltung.map(zimmer => {
                const statusKey = zimmer.fields.zimmer_status?.key ?? 'verfuegbar';
                const colorClass = ZIMMER_STATUS_COLORS[statusKey] ?? 'bg-gray-100 text-gray-700 border-gray-200';
                // Find active booking for this room
                const aktiveBuchung = enrichedBuchungen.find(b => {
                  const zimId = b.fields.zimmer?.split('/').pop();
                  return zimId === zimmer.record_id && b.fields.buchungsstatus?.key === 'eingecheckt';
                });
                const naechsteBuchung = enrichedBuchungen.find(b => {
                  const zimId = b.fields.zimmer?.split('/').pop();
                  return zimId === zimmer.record_id && isUpcoming(b.fields.anreise) && b.fields.buchungsstatus?.key === 'bestaetigt';
                });

                return (
                  <div
                    key={zimmer.record_id}
                    className={`rounded-xl border-2 p-4 space-y-3 ${colorClass} relative overflow-hidden`}
                  >
                    {/* Room header */}
                    <div className="flex items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{zimmer.fields.zimmer_name ?? '—'}</p>
                        <p className="text-xs opacity-75">{zimmer.fields.zimmer_typ?.label ?? '—'}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => { setEditZimmer(zimmer); setZimmerDialogOpen(true); }}
                          className="rounded-md p-1 hover:bg-black/10 transition-colors"
                          title="Bearbeiten"
                        >
                          <IconPencil size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/50">
                        {zimmer.fields.zimmer_status?.label ?? 'Unbekannt'}
                      </span>
                    </div>

                    {/* Capacity & price */}
                    <div className="flex gap-3 text-xs opacity-80">
                      <span>max. {zimmer.fields.kapazitaet ?? '?'} Katze(n)</span>
                      {zimmer.fields.tagespreis != null && (
                        <span>{formatCurrency(zimmer.fields.tagespreis)}/Tag</span>
                      )}
                    </div>

                    {/* Active booking info */}
                    {aktiveBuchung && (
                      <div className="rounded-lg bg-white/50 p-2 text-xs space-y-0.5">
                        <p className="font-medium truncate">{aktiveBuchung.kundeName}</p>
                        <p className="opacity-75 truncate">{aktiveBuchung.katzenName}</p>
                        <p className="opacity-70">
                          bis {formatDate(aktiveBuchung.fields.abreise?.slice(0, 10))}
                        </p>
                      </div>
                    )}

                    {/* Next booking */}
                    {!aktiveBuchung && naechsteBuchung && (
                      <div className="rounded-lg bg-white/40 p-2 text-xs space-y-0.5">
                        <p className="opacity-70 font-medium">Nächste Buchung:</p>
                        <p className="truncate">{naechsteBuchung.kundeName}</p>
                        <p className="opacity-70">ab {formatDate(naechsteBuchung.fields.anreise?.slice(0, 10))}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Buchungen ──────────────────────────────────────────────── */}
      {activeTab === 'buchungen' && (
        <div className="space-y-4">
          {/* Header + filter + action */}
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap gap-1">
              {[
                { key: 'alle', label: 'Alle' },
                { key: 'anreise', label: 'Anreise heute' },
                { key: 'abreise', label: 'Abreise heute' },
                { key: 'eingecheckt', label: 'Eingecheckt' },
                { key: 'upcoming', label: 'Demnächst' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setBuchungFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    buchungFilter === f.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => { setEditBuchung(null); setBuchungDialogOpen(true); }}>
              <IconPlus size={14} className="mr-1 shrink-0" />
              Buchung anlegen
            </Button>
          </div>

          {/* Buchungen list */}
          {filteredBuchungen.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <IconCalendarCheck size={48} stroke={1.5} />
              <p className="text-sm">Keine Buchungen gefunden</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredBuchungen.map(buchung => {
                const statusKey = buchung.fields.buchungsstatus?.key ?? '';
                const statusColor = BUCHUNG_STATUS_COLORS[statusKey] ?? 'bg-gray-100 text-gray-700';
                const isCheckedIn = statusKey === 'eingecheckt';
                const isAnreisteToday = isToday(buchung.fields.anreise);
                const isAbreiseToday = isToday(buchung.fields.abreise);

                return (
                  <div
                    key={buchung.record_id}
                    className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 overflow-hidden"
                  >
                    {/* Left: indicator stripe */}
                    <div className={`hidden sm:block w-1 self-stretch rounded-full ${
                      isCheckedIn ? 'bg-green-400' :
                      isAnreisteToday ? 'bg-blue-400' :
                      isAbreiseToday ? 'bg-orange-400' : 'bg-muted'
                    }`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm truncate">{buchung.kundeName || '—'}</span>
                        {buchung.fields.buchungsnummer && (
                          <span className="text-xs text-muted-foreground">#{buchung.fields.buchungsnummer}</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
                          {buchung.fields.buchungsstatus?.label ?? '—'}
                        </span>
                        {isAnreisteToday && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium flex items-center gap-1">
                            <IconArrowRight size={11} />Anreise heute
                          </span>
                        )}
                        {isAbreiseToday && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium flex items-center gap-1">
                            <IconArrowLeft size={11} />Abreise heute
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        {buchung.katzenName && (
                          <span className="flex items-center gap-1">
                            <IconCat size={12} className="shrink-0" />
                            <span className="truncate">{buchung.katzenName}</span>
                          </span>
                        )}
                        {buchung.zimmerName && (
                          <span className="flex items-center gap-1">
                            <IconDoor size={12} className="shrink-0" />
                            <span className="truncate">{buchung.zimmerName}</span>
                          </span>
                        )}
                        <span>
                          {formatDate(buchung.fields.anreise?.slice(0, 10))} – {formatDate(buchung.fields.abreise?.slice(0, 10))}
                        </span>
                        {buchung.fields.gesamtpreis != null && (
                          <span className="flex items-center gap-0.5">
                            <IconCurrencyEuro size={11} className="shrink-0" />
                            {formatCurrency(buchung.fields.gesamtpreis)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => { setEditBuchung(buchung); setBuchungDialogOpen(true); }}
                        title="Bearbeiten"
                      >
                        <IconPencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteBuchung(buchung)}
                        title="Löschen"
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Dialogs ────────────────────────────────────────────────── */}
      <BuchungsverwaltungDialog
        open={buchungDialogOpen}
        onClose={() => { setBuchungDialogOpen(false); setEditBuchung(null); }}
        onSubmit={editBuchung ? handleEditBuchung : handleCreateBuchung}
        defaultValues={editBuchung?.fields}
        kundenverwaltungList={kundenverwaltung}
        katzenverwaltungList={katzenverwaltung}
        zimmerverwaltungList={zimmerverwaltung}
        leistungsverwaltungList={leistungsverwaltung}
        enablePhotoScan={AI_PHOTO_SCAN['Buchungsverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Buchungsverwaltung']}
      />

      <ZimmerverwaltungDialog
        open={zimmerDialogOpen}
        onClose={() => { setZimmerDialogOpen(false); setEditZimmer(null); }}
        onSubmit={editZimmer ? handleEditZimmer : handleCreateZimmer}
        defaultValues={editZimmer?.fields}
        enablePhotoScan={AI_PHOTO_SCAN['Zimmerverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Zimmerverwaltung']}
      />

      <ConfirmDialog
        open={!!deleteBuchung}
        title="Buchung löschen"
        description={`Buchung von ${deleteBuchung?.kundeName ?? '—'} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        onConfirm={handleDeleteBuchung}
        onClose={() => setDeleteBuchung(null)}
      />
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="flex gap-4 border-b border-border pb-0">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
      </div>
    </div>
  );
}

// ── Error ─────────────────────────────────────────────────────────────────────

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte lade die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktiere den Support.</p>}
    </div>
  );
}
