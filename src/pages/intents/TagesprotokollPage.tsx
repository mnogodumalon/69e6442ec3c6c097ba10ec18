import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Buchungsverwaltung, Katzenverwaltung } from '@/types/app';
import {
  IconCalendarEvent,
  IconCat,
  IconCheck,
  IconChevronRight,
  IconAlertCircle,
  IconMedicineSyrup,
  IconNotes,
  IconRefresh,
  IconArrowRight,
} from '@tabler/icons-react';

const TODAY = '2026-04-20';

function formatDate(val: string | undefined | null): string {
  if (!val) return '—';
  try {
    const d = parseISO(val);
    return format(d, 'dd.MM.yyyy', { locale: de });
  } catch {
    return val;
  }
}

const FRESSVERHALTEN_OPTIONS = LOOKUP_OPTIONS['gesundheitsprotokoll']?.fressverhalten ?? [];
const AKTIVITAET_OPTIONS = LOOKUP_OPTIONS['gesundheitsprotokoll']?.aktivitaet ?? [];
const BEFINDEN_OPTIONS = LOOKUP_OPTIONS['gesundheitsprotokoll']?.befinden ?? [];

interface CatFormState {
  fressverhalten: string;
  aktivitaet: string;
  befinden: string;
  medikamente_verabreicht: boolean;
  medikamente_notiz: string;
  beobachtungen: string;
  touched: boolean;
}

function emptyForm(): CatFormState {
  return {
    fressverhalten: '',
    aktivitaet: '',
    befinden: '',
    medikamente_verabreicht: false,
    medikamente_notiz: '',
    beobachtungen: '',
    touched: false,
  };
}

export default function TagesprotokollPage() {
  const [searchParams] = useSearchParams();
  const { buchungsverwaltung, katzenverwaltung, kundenverwaltungMap, zimmerverwaltungMap, loading, error, fetchAll } = useDashboardData();

  const initialStep = (() => {
    const s = parseInt(searchParams.get('step') ?? '', 10);
    if (s >= 1 && s <= 3) return s;
    return 1;
  })();

  const [step, setStep] = useState(initialStep);
  const [selectedBuchungId, setSelectedBuchungId] = useState<string | null>(searchParams.get('buchungId'));
  const [catForms, setCatForms] = useState<Record<string, CatFormState>>({});
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [saveTotal, setSaveTotal] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [done, setDone] = useState(false);

  // Resolve selected booking
  const selectedBuchung: Buchungsverwaltung | null = useMemo(() => {
    if (!selectedBuchungId) return null;
    return buchungsverwaltung.find(b => b.record_id === selectedBuchungId) ?? null;
  }, [selectedBuchungId, buchungsverwaltung]);

  // Resolve cats for the selected booking
  const bookingCats: Katzenverwaltung[] = useMemo(() => {
    if (!selectedBuchung) return [];
    const katzenRaw = selectedBuchung.fields.katzen;
    if (!katzenRaw) return [];

    // katzen is a multipleapplookup — stored as comma-separated URLs or JSON array
    let ids: string[] = [];
    if (typeof katzenRaw === 'string') {
      // Try JSON parse first
      try {
        const parsed = JSON.parse(katzenRaw);
        if (Array.isArray(parsed)) {
          ids = parsed.map((u: unknown) => extractRecordId(u)).filter(Boolean) as string[];
        }
      } catch {
        // comma separated or single URL
        ids = katzenRaw.split(',').map(u => extractRecordId(u.trim())).filter(Boolean) as string[];
      }
    }
    return ids.map(id => katzenverwaltung.find(k => k.record_id === id)).filter(Boolean) as Katzenverwaltung[];
  }, [selectedBuchung, katzenverwaltung]);

  // Initialize cat forms when cats are loaded
  useEffect(() => {
    if (bookingCats.length === 0) return;
    setCatForms(prev => {
      const next = { ...prev };
      bookingCats.forEach(cat => {
        if (!next[cat.record_id]) {
          next[cat.record_id] = emptyForm();
        }
      });
      return next;
    });
  }, [bookingCats]);

  // Filtered bookings — eingecheckt first, fallback to all
  const eingechecktBuchungen = useMemo(() =>
    buchungsverwaltung.filter(b => b.fields.buchungsstatus?.key === 'eingecheckt'),
    [buchungsverwaltung]
  );
  const displayBuchungen = eingechecktBuchungen.length > 0 ? eingechecktBuchungen : buchungsverwaltung;
  const showNoCheckinNote = eingechecktBuchungen.length === 0 && buchungsverwaltung.length > 0;

  const protocolledCount = bookingCats.filter(c => {
    const f = catForms[c.record_id];
    return f && f.befinden !== '';
  }).length;

  const allValid = bookingCats.length > 0 && bookingCats.every(c => {
    const f = catForms[c.record_id];
    return f && f.befinden !== '';
  });

  function handleSelectBuchung(id: string) {
    setSelectedBuchungId(id);
    setStep(2);
  }

  function updateCatForm(catId: string, updates: Partial<CatFormState>) {
    setCatForms(prev => ({
      ...prev,
      [catId]: { ...(prev[catId] ?? emptyForm()), ...updates, touched: true },
    }));
  }

  async function handleSave() {
    if (!selectedBuchungId) return;
    setSaving(true);
    setSaveError(null);
    setSaveProgress(0);
    setSaveTotal(bookingCats.length);

    let count = 0;
    for (const cat of bookingCats) {
      const form = catForms[cat.record_id] ?? emptyForm();
      try {
        await LivingAppsService.createGesundheitsprotokollEntry({
          buchung: createRecordUrl(APP_IDS.BUCHUNGSVERWALTUNG, selectedBuchungId),
          katze: createRecordUrl(APP_IDS.KATZENVERWALTUNG, cat.record_id),
          protokoll_datum: TODAY,
          fressverhalten: form.fressverhalten || undefined,
          aktivitaet: form.aktivitaet || undefined,
          befinden: form.befinden || undefined,
          medikamente_verabreicht: form.medikamente_verabreicht,
          medikamente_notiz: form.medikamente_notiz || undefined,
          beobachtungen: form.beobachtungen || undefined,
        });
        count++;
        setSaveProgress(count);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setSaveError(`Fehler beim Speichern von ${cat.fields.katze_name ?? 'Katze'}: ${msg}`);
        setSaving(false);
        return;
      }
    }

    setSavedCount(count);
    setSaving(false);
    setDone(true);
    await fetchAll();
  }

  function handleRestart() {
    setStep(1);
    setSelectedBuchungId(null);
    setCatForms({});
    setSaveProgress(0);
    setSaveTotal(0);
    setSaveError(null);
    setSavedCount(0);
    setDone(false);
  }

  function getLookupLabel(options: { key: string; label: string }[], key: string): string {
    return options.find(o => o.key === key)?.label ?? key;
  }

  return (
    <IntentWizardShell
      title="Tagesprotokoll erfassen"
      subtitle={`Gesundheitsstatus der Hotelgäste für heute (${formatDate(TODAY)}) dokumentieren`}
      steps={[
        { label: 'Buchung wählen' },
        { label: 'Katzen protokollieren' },
        { label: 'Zusammenfassung' },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Buchung wählen ── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Today's date banner */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/20">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <IconCalendarEvent size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Protokolldatum</p>
              <p className="text-lg font-bold text-primary">{formatDate(TODAY)}</p>
            </div>
          </div>

          {showNoCheckinNote && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <IconAlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Keine eingecheckten Buchungen gefunden. Es werden alle Buchungen angezeigt.
              </p>
            </div>
          )}

          <EntitySelectStep
            items={displayBuchungen.map(b => {
              const kundeId = extractRecordId(b.fields.kunde);
              const kunde = kundeId ? kundenverwaltungMap.get(kundeId) : undefined;
              const kundeName = kunde
                ? `${kunde.fields.vorname ?? ''} ${kunde.fields.nachname ?? ''}`.trim()
                : '—';
              const zimmerId = extractRecordId(b.fields.zimmer);
              const zimmer = zimmerId ? zimmerverwaltungMap.get(zimmerId) : undefined;
              const zimmerName = zimmer?.fields.zimmer_name ?? '—';

              return {
                id: b.record_id,
                title: b.fields.buchungsnummer ?? `Buchung ${b.record_id.slice(0, 8)}`,
                subtitle: `${kundeName} · Zimmer: ${zimmerName}`,
                status: b.fields.buchungsstatus
                  ? { key: b.fields.buchungsstatus.key, label: b.fields.buchungsstatus.label }
                  : undefined,
                stats: [
                  { label: 'Anreise', value: formatDate(b.fields.anreise) },
                  { label: 'Abreise', value: formatDate(b.fields.abreise) },
                ],
                icon: <IconCalendarEvent size={18} className="text-primary" />,
              };
            })}
            onSelect={handleSelectBuchung}
            searchPlaceholder="Buchung suchen..."
            emptyIcon={<IconCalendarEvent size={32} />}
            emptyText="Keine Buchungen gefunden."
          />
        </div>
      )}

      {/* ── Step 2: Katzen protokollieren ── */}
      {step === 2 && selectedBuchung && (
        <div className="space-y-4">
          {/* Booking info bar */}
          <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-secondary border overflow-hidden">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Aktive Buchung</p>
              <p className="font-semibold truncate">
                {selectedBuchung.fields.buchungsnummer ?? `Buchung ${selectedBuchung.record_id.slice(0, 8)}`}
              </p>
            </div>
            {selectedBuchung.fields.buchungsstatus && (
              <StatusBadge
                statusKey={selectedBuchung.fields.buchungsstatus.key}
                label={selectedBuchung.fields.buchungsstatus.label}
              />
            )}
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-card border">
            <IconCat size={18} className="text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">
                  {protocolledCount} von {bookingCats.length} Katzen protokolliert
                </span>
                <span className="text-xs text-muted-foreground">
                  {bookingCats.length > 0 ? Math.round((protocolledCount / bookingCats.length) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: bookingCats.length > 0 ? `${(protocolledCount / bookingCats.length) * 100}%` : '0%' }}
                />
              </div>
            </div>
          </div>

          {bookingCats.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-3 text-muted-foreground">
              <IconCat size={32} className="opacity-30" />
              <p className="text-sm">Keine Katzen dieser Buchung gefunden.</p>
            </div>
          )}

          {/* Cat form cards */}
          {bookingCats.map(cat => {
            const form = catForms[cat.record_id] ?? emptyForm();
            const isComplete = form.befinden !== '';

            return (
              <Card key={cat.record_id} className={`overflow-hidden transition-colors ${isComplete ? 'border-primary/40' : ''}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <IconCat size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="truncate">{cat.fields.katze_name ?? 'Unbenannte Katze'}</span>
                      <div className="flex gap-2 mt-0.5">
                        {cat.fields.rasse && (
                          <span className="text-xs font-normal text-muted-foreground">{cat.fields.rasse}</span>
                        )}
                        {cat.fields.farbe && (
                          <span className="text-xs font-normal text-muted-foreground">· {cat.fields.farbe}</span>
                        )}
                      </div>
                    </div>
                    {isComplete && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <IconCheck size={12} className="text-primary-foreground" stroke={2.5} />
                      </div>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Fressverhalten */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Fressverhalten</label>
                    <Select
                      value={form.fressverhalten}
                      onValueChange={v => updateCatForm(cat.record_id, { fressverhalten: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Bitte wählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {FRESSVERHALTEN_OPTIONS.map(o => (
                          <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Aktivität */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Aktivität</label>
                    <Select
                      value={form.aktivitaet}
                      onValueChange={v => updateCatForm(cat.record_id, { aktivitaet: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Bitte wählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {AKTIVITAET_OPTIONS.map(o => (
                          <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Befinden (required) */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Befinden <span className="text-destructive">*</span>
                    </label>
                    <Select
                      value={form.befinden}
                      onValueChange={v => updateCatForm(cat.record_id, { befinden: v })}
                    >
                      <SelectTrigger className={`w-full ${!form.befinden && form.touched ? 'border-destructive' : ''}`}>
                        <SelectValue placeholder="Bitte wählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {BEFINDEN_OPTIONS.map(o => (
                          <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!form.befinden && form.touched && (
                      <p className="text-xs text-destructive mt-1">Befinden ist ein Pflichtfeld.</p>
                    )}
                  </div>

                  {/* Medikamente */}
                  <div>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <div
                        role="checkbox"
                        aria-checked={form.medikamente_verabreicht}
                        tabIndex={0}
                        onClick={() => updateCatForm(cat.record_id, { medikamente_verabreicht: !form.medikamente_verabreicht })}
                        onKeyDown={e => {
                          if (e.key === ' ' || e.key === 'Enter') updateCatForm(cat.record_id, { medikamente_verabreicht: !form.medikamente_verabreicht });
                        }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                          form.medikamente_verabreicht ? 'bg-primary border-primary' : 'border-input bg-background'
                        }`}
                      >
                        {form.medikamente_verabreicht && <IconCheck size={11} className="text-primary-foreground" stroke={3} />}
                      </div>
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <IconMedicineSyrup size={15} className="text-muted-foreground" />
                        Medikamente verabreicht
                      </span>
                    </label>
                  </div>

                  {form.medikamente_verabreicht && (
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Medikamenten-Notiz</label>
                      <Textarea
                        placeholder="Welche Medikamente, Dosierung, Uhrzeit..."
                        value={form.medikamente_notiz}
                        onChange={e => updateCatForm(cat.record_id, { medikamente_notiz: e.target.value })}
                        className="resize-none"
                        rows={3}
                      />
                    </div>
                  )}

                  {/* Beobachtungen */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                      <IconNotes size={14} className="text-muted-foreground" />
                      Beobachtungen
                    </label>
                    <Textarea
                      placeholder="Besonderheiten, Verhalten, Auffälligkeiten..."
                      value={form.beobachtungen}
                      onChange={e => updateCatForm(cat.record_id, { beobachtungen: e.target.value })}
                      className="resize-none"
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Navigation */}
          <div className="flex flex-wrap gap-3 pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              Zurück
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              disabled={!allValid || bookingCats.length === 0}
              onClick={() => {
                // Mark all as touched to show validation
                if (!allValid) {
                  setCatForms(prev => {
                    const next = { ...prev };
                    bookingCats.forEach(c => {
                      next[c.record_id] = { ...(next[c.record_id] ?? emptyForm()), touched: true };
                    });
                    return next;
                  });
                  return;
                }
                setStep(3);
              }}
            >
              Weiter zur Zusammenfassung
              <IconChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Zusammenfassung & Speichern ── */}
      {step === 3 && selectedBuchung && (
        <div className="space-y-4">
          {done ? (
            /* Success screen */
            <div className="flex flex-col items-center py-12 gap-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <IconCheck size={32} className="text-primary" stroke={2} />
              </div>
              <div>
                <h2 className="text-xl font-bold mb-1">{savedCount} {savedCount === 1 ? 'Protokoll' : 'Protokolle'} erfolgreich gespeichert</h2>
                <p className="text-sm text-muted-foreground">
                  Tagesprotokoll für {formatDate(TODAY)} wurde gespeichert.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button variant="outline" onClick={handleRestart}>
                  <IconRefresh size={15} className="mr-1.5" />
                  Weitere Buchung protokollieren
                </Button>
                <Button asChild>
                  <a href="#/gesundheitsprotokoll">
                    Protokoll öffnen
                    <IconArrowRight size={15} className="ml-1.5" />
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Summary header */}
              <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-secondary border overflow-hidden">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Buchung</p>
                  <p className="font-semibold truncate">
                    {selectedBuchung.fields.buchungsnummer ?? `Buchung ${selectedBuchung.record_id.slice(0, 8)}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">Protokolldatum</p>
                  <p className="font-semibold">{formatDate(TODAY)}</p>
                </div>
              </div>

              {/* Summary table */}
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Katze</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Fressen</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Aktivität</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Befinden</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Medikamente</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Beobachtungen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookingCats.map((cat, idx) => {
                      const form = catForms[cat.record_id] ?? emptyForm();
                      return (
                        <tr key={cat.record_id} className={`border-b last:border-0 ${idx % 2 === 0 ? '' : 'bg-muted/20'}`}>
                          <td className="px-4 py-3">
                            <span className="font-medium truncate block max-w-[120px]">{cat.fields.katze_name ?? '—'}</span>
                            {cat.fields.rasse && <span className="text-xs text-muted-foreground">{cat.fields.rasse}</span>}
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                            {form.fressverhalten ? getLookupLabel(FRESSVERHALTEN_OPTIONS, form.fressverhalten) : '—'}
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                            {form.aktivitaet ? getLookupLabel(AKTIVITAET_OPTIONS, form.aktivitaet) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            {form.befinden ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                {getLookupLabel(BEFINDEN_OPTIONS, form.befinden)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {form.medikamente_verabreicht ? (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                <IconMedicineSyrup size={11} />
                                Ja
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">Nein</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell max-w-[200px]">
                            {form.beobachtungen ? (
                              <span className="text-xs text-muted-foreground line-clamp-2">{form.beobachtungen}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {saveError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                  <IconAlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{saveError}</p>
                </div>
              )}

              {/* Save progress */}
              {saving && (
                <div className="p-4 rounded-xl bg-card border">
                  <p className="text-sm font-medium mb-2">
                    Speichere {saveProgress}/{saveTotal}...
                  </p>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: saveTotal > 0 ? `${(saveProgress / saveTotal) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>
                  Zurück
                </Button>
                <Button
                  className="flex-1 sm:flex-none"
                  onClick={handleSave}
                  disabled={saving || bookingCats.length === 0}
                >
                  {saving ? (
                    <>Speichere {saveProgress}/{saveTotal}...</>
                  ) : (
                    <>
                      <IconCheck size={15} className="mr-1.5" />
                      Protokoll speichern ({bookingCats.length} {bookingCats.length === 1 ? 'Katze' : 'Katzen'})
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
