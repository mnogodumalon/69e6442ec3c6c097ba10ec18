import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { BudgetTracker } from '@/components/BudgetTracker';
import { StatusBadge } from '@/components/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kundenverwaltung, Katzenverwaltung, Zimmerverwaltung, Leistungsverwaltung } from '@/types/app';
import { KundenverwaltungDialog } from '@/components/dialogs/KundenverwaltungDialog';
import { KatzenverwaltungDialog } from '@/components/dialogs/KatzenverwaltungDialog';
import { LeistungsverwaltungDialog } from '@/components/dialogs/LeistungsverwaltungDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  IconPlus, IconChevronRight, IconChevronLeft, IconCheck,
  IconCat, IconHome, IconUser, IconStar, IconCalendar,
  IconCircleCheck, IconLoader2,
} from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Kunde' },
  { label: 'Katzen' },
  { label: 'Zimmer & Zeitraum' },
  { label: 'Zusatzleistungen' },
  { label: 'Bestätigen' },
];

function getNights(anreise: string, abreise: string): number {
  if (!anreise || !abreise) return 0;
  const d1 = new Date(anreise);
  const d2 = new Date(abreise);
  const diff = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.floor(diff));
}

export default function NeueBuchungPage() {
  const { kundenverwaltung, katzenverwaltung, zimmerverwaltung, leistungsverwaltung, loading, error, fetchAll } = useDashboardData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Step state — initialized from URL ?step= param
  const initialStep = (() => {
    const s = parseInt(searchParams.get('step') ?? '', 10);
    if (s >= 1 && s <= 5) return s;
    return 1;
  })();
  const [currentStep, setCurrentStep] = useState(initialStep);

  // Step 1: Kunde
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);
  const [kundeDialogOpen, setKundeDialogOpen] = useState(false);

  // Step 2: Katzen
  const [selectedKatzenIds, setSelectedKatzenIds] = useState<Set<string>>(new Set());
  const [katzeDialogOpen, setKatzeDialogOpen] = useState(false);

  // Step 3: Zimmer & Zeitraum
  const [anreise, setAnreise] = useState('');
  const [abreise, setAbreise] = useState('');
  const [selectedZimmer, setSelectedZimmer] = useState<Zimmerverwaltung | null>(null);

  // Step 4: Zusatzleistungen
  const [selectedLeistungIds, setSelectedLeistungIds] = useState<Set<string>>(new Set());
  const [leistungDialogOpen, setLeistungDialogOpen] = useState(false);

  // Step 5: Buchungsdetails
  const [anzahlung, setAnzahlung] = useState('');
  const [buchungshinweise, setBuchungshinweise] = useState('');
  const [zahlungsstatus, setZahlungsstatus] = useState('offen');
  const [buchungsstatus, setBuchungsstatus] = useState('anfrage');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successBuchungsnummer, setSuccessBuchungsnummer] = useState<string | null>(null);

  // Sync URL param when step changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('step', String(currentStep));
    window.history.replaceState(null, '', '#/intents/neue-buchung?' + params.toString());
  }, [currentStep, searchParams]);

  // Derived data
  const filteredKatzen = useMemo(() => {
    if (!selectedKunde) return [];
    const kundeUrl = createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id);
    return katzenverwaltung.filter(k => k.fields.besitzer === kundeUrl);
  }, [katzenverwaltung, selectedKunde]);

  const availableZimmer = useMemo(() => {
    return zimmerverwaltung.filter(z => {
      const statusKey = z.fields.zimmer_status?.key ?? z.fields.zimmer_status;
      return statusKey !== 'belegt';
    });
  }, [zimmerverwaltung]);

  const nights = useMemo(() => getNights(anreise, abreise), [anreise, abreise]);

  const zimmerkosten = useMemo(() => {
    if (!selectedZimmer) return 0;
    return (selectedZimmer.fields.tagespreis ?? 0) * nights;
  }, [selectedZimmer, nights]);

  const selectedLeistungen = useMemo(() => {
    return leistungsverwaltung.filter(l => selectedLeistungIds.has(l.record_id));
  }, [leistungsverwaltung, selectedLeistungIds]);

  const leistungskosten = useMemo(() => {
    return selectedLeistungen.reduce((sum, l) => sum + (l.fields.preis ?? 0), 0);
  }, [selectedLeistungen]);

  const gesamtpreis = zimmerkosten + leistungskosten;

  // Handlers
  function handleKundeSelect(id: string) {
    const kunde = kundenverwaltung.find(k => k.record_id === id) ?? null;
    setSelectedKunde(kunde);
    setSelectedKatzenIds(new Set());
    setCurrentStep(2);
  }

  async function handleKundeCreated(fields: Kundenverwaltung['fields']) {
    await LivingAppsService.createKundenverwaltungEntry(fields);
    await fetchAll();
    setKundeDialogOpen(false);
  }

  function toggleKatze(id: string) {
    setSelectedKatzenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleKatzeCreated(fields: Katzenverwaltung['fields']) {
    await LivingAppsService.createKatzenverwaltungEntry(fields);
    await fetchAll();
    setKatzeDialogOpen(false);
  }

  function handleZimmerSelect(zimmer: Zimmerverwaltung) {
    setSelectedZimmer(zimmer);
  }

  async function handleLeistungCreated(fields: Leistungsverwaltung['fields']) {
    await LivingAppsService.createLeistungsverwaltungEntry(fields);
    await fetchAll();
    setLeistungDialogOpen(false);
  }

  function toggleLeistung(id: string) {
    setSelectedLeistungIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!selectedKunde || !selectedZimmer || !anreise || !abreise) return;
    setSubmitting(true);
    setSubmitError(null);
    const buchungsnummer = 'BU-' + Date.now();
    try {
      const katzenUrls = Array.from(selectedKatzenIds).map(id =>
        createRecordUrl(APP_IDS.KATZENVERWALTUNG, id)
      );
      const leistungenUrls = Array.from(selectedLeistungIds).map(id =>
        createRecordUrl(APP_IDS.LEISTUNGSVERWALTUNG, id)
      );
      await LivingAppsService.createBuchungsverwaltungEntry({
        buchungsnummer,
        buchungsstatus,
        anreise: anreise.slice(0, 16),
        abreise: abreise.slice(0, 16),
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
        katzen: katzenUrls as unknown as string,
        zimmer: createRecordUrl(APP_IDS.ZIMMERVERWALTUNG, selectedZimmer.record_id),
        zusatzleistungen: leistungenUrls as unknown as string,
        gesamtpreis,
        anzahlung: anzahlung ? parseFloat(anzahlung) : undefined,
        zahlungsstatus,
        buchungshinweise: buchungshinweise || undefined,
      });
      setSuccessBuchungsnummer(buchungsnummer);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setSubmitting(false);
    }
  }

  function handleNeuereBuchung() {
    setSelectedKunde(null);
    setSelectedKatzenIds(new Set());
    setAnreise('');
    setAbreise('');
    setSelectedZimmer(null);
    setSelectedLeistungIds(new Set());
    setAnzahlung('');
    setBuchungshinweise('');
    setZahlungsstatus('offen');
    setBuchungsstatus('anfrage');
    setSubmitError(null);
    setSuccessBuchungsnummer(null);
    setCurrentStep(1);
  }

  // Success screen
  if (successBuchungsnummer) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col items-center justify-center py-20 gap-6">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <IconCircleCheck size={36} className="text-green-600" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Buchung erfolgreich angelegt!</h2>
            <p className="text-muted-foreground">
              Buchungsnummer: <span className="font-semibold text-foreground">{successBuchungsnummer}</span>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleNeuereBuchung} variant="outline">
              <IconPlus size={16} className="mr-2" />
              Weitere Buchung anlegen
            </Button>
            <Button onClick={() => navigate('/buchungsverwaltung')}>
              <IconCalendar size={16} className="mr-2" />
              Zur Buchungsübersicht
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <IntentWizardShell
      title="Neue Buchung anlegen"
      subtitle="Führe dich Schritt für Schritt durch die Buchungserstellung"
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Kunde wählen ── */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Kunde wählen</h2>
            <p className="text-sm text-muted-foreground">Wähle den Kunden, für den die Buchung erstellt wird.</p>
          </div>
          <EntitySelectStep
            items={kundenverwaltung.map(k => ({
              id: k.record_id,
              title: [k.fields.vorname, k.fields.nachname].filter(Boolean).join(' ') || '(Kein Name)',
              subtitle: k.fields.email,
              stats: k.fields.telefon ? [{ label: 'Telefon', value: k.fields.telefon }] : [],
              icon: <IconUser size={18} className="text-primary" />,
            }))}
            onSelect={handleKundeSelect}
            searchPlaceholder="Kunden suchen..."
            emptyText="Kein Kunde gefunden. Erstelle zuerst einen neuen Kunden."
            emptyIcon={<IconUser size={32} />}
            createLabel="Neuen Kunden anlegen"
            onCreateNew={() => setKundeDialogOpen(true)}
            createDialog={
              <KundenverwaltungDialog
                open={kundeDialogOpen}
                onClose={() => setKundeDialogOpen(false)}
                onSubmit={handleKundeCreated}
              />
            }
          />
        </div>
      )}

      {/* ── Step 2: Katzen wählen ── */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Katzen wählen</h2>
            <p className="text-sm text-muted-foreground">
              Wähle eine oder mehrere Katzen von{' '}
              <span className="font-medium">
                {[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname].filter(Boolean).join(' ')}
              </span>
              .
            </p>
          </div>

          {/* Neue Katze anlegen */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setKatzeDialogOpen(true)} className="gap-1.5">
              <IconPlus size={15} />
              Neue Katze anlegen
            </Button>
          </div>

          <KatzenverwaltungDialog
            open={katzeDialogOpen}
            onClose={() => setKatzeDialogOpen(false)}
            onSubmit={handleKatzeCreated}
            kundenverwaltungList={kundenverwaltung}
            defaultValues={
              selectedKunde
                ? { besitzer: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id) }
                : undefined
            }
          />

          {filteredKatzen.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-xl bg-card">
              <IconCat size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Dieser Kunde hat noch keine Katzen.</p>
              <p className="text-xs mt-1">Lege oben eine neue Katze an.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredKatzen.map(katze => {
                const selected = selectedKatzenIds.has(katze.record_id);
                return (
                  <button
                    key={katze.record_id}
                    onClick={() => toggleKatze(katze.record_id)}
                    className={`w-full text-left flex items-center gap-3 p-4 rounded-xl border transition-colors overflow-hidden ${
                      selected
                        ? 'bg-primary/5 border-primary ring-1 ring-primary/30'
                        : 'bg-card hover:bg-accent hover:border-primary/30'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selected ? 'bg-primary' : 'bg-muted'}`}>
                      {selected
                        ? <IconCheck size={18} className="text-primary-foreground" />
                        : <IconCat size={18} className="text-muted-foreground" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium text-sm truncate ${selected ? 'text-primary' : ''}`}>
                          {katze.fields.katze_name ?? '(Kein Name)'}
                        </span>
                        {katze.fields.rasse && (
                          <span className="text-xs text-muted-foreground truncate">{katze.fields.rasse}</span>
                        )}
                      </div>
                      {katze.fields.farbe && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          Farbe: {katze.fields.farbe}
                        </p>
                      )}
                    </div>
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${selected ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                      {selected && <IconCheck size={12} className="text-primary-foreground" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Live count */}
          {selectedKatzenIds.size > 0 && (
            <p className="text-sm font-medium text-primary">
              {selectedKatzenIds.size} Katze{selectedKatzenIds.size !== 1 ? 'n' : ''} ausgewählt
            </p>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(1)}>
              <IconChevronLeft size={16} className="mr-1" />
              Zurück
            </Button>
            <Button
              onClick={() => setCurrentStep(3)}
              disabled={selectedKatzenIds.size === 0}
            >
              Weiter
              <IconChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Zimmer & Zeitraum ── */}
      {currentStep === 3 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Zimmer & Zeitraum wählen</h2>
            <p className="text-sm text-muted-foreground">Bestimme den Aufenthaltszeitraum und wähle ein geeignetes Zimmer.</p>
          </div>

          {/* Datum-Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="anreise">Anreise</Label>
              <Input
                id="anreise"
                type="datetime-local"
                value={anreise}
                onChange={e => setAnreise(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="abreise">Abreise</Label>
              <Input
                id="abreise"
                type="datetime-local"
                value={abreise}
                min={anreise}
                onChange={e => setAbreise(e.target.value)}
              />
            </div>
          </div>

          {/* Nächte + Budget */}
          {anreise && abreise && nights > 0 && selectedZimmer && (
            <BudgetTracker
              budget={zimmerkosten}
              booked={zimmerkosten}
              label={`Zimmerkosten (${nights} Nacht${nights !== 1 ? 'e' : ''})`}
              showRemaining={false}
            />
          )}
          {anreise && abreise && nights > 0 && !selectedZimmer && (
            <p className="text-sm text-muted-foreground">
              Aufenthaltsdauer: <span className="font-medium text-foreground">{nights} Nacht{nights !== 1 ? 'e' : ''}</span>
            </p>
          )}
          {anreise && abreise && nights === 0 && (
            <p className="text-sm text-destructive">Abreise muss nach der Anreise liegen.</p>
          )}

          {/* Zimmer-Liste */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Verfügbare Zimmer</h3>
            {availableZimmer.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground border rounded-xl bg-card">
                <IconHome size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">Keine verfügbaren Zimmer gefunden.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableZimmer.map(zimmer => {
                  const isSelected = selectedZimmer?.record_id === zimmer.record_id;
                  const statusKey = typeof zimmer.fields.zimmer_status === 'object'
                    ? zimmer.fields.zimmer_status?.key
                    : zimmer.fields.zimmer_status;
                  const statusLabel = typeof zimmer.fields.zimmer_status === 'object'
                    ? zimmer.fields.zimmer_status?.label
                    : zimmer.fields.zimmer_status;
                  return (
                    <button
                      key={zimmer.record_id}
                      onClick={() => handleZimmerSelect(zimmer)}
                      className={`w-full text-left flex items-center gap-3 p-4 rounded-xl border transition-colors overflow-hidden ${
                        isSelected
                          ? 'bg-primary/5 border-primary ring-1 ring-primary/30'
                          : 'bg-card hover:bg-accent hover:border-primary/30'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-primary' : 'bg-muted'}`}>
                        {isSelected
                          ? <IconCheck size={18} className="text-primary-foreground" />
                          : <IconHome size={18} className="text-muted-foreground" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium text-sm truncate ${isSelected ? 'text-primary' : ''}`}>
                            {zimmer.fields.zimmer_name ?? '(Kein Name)'}
                          </span>
                          {statusKey && (
                            <StatusBadge statusKey={statusKey} label={statusLabel} />
                          )}
                        </div>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {zimmer.fields.zimmer_typ && (
                            <span>
                              Typ: <span className="font-medium text-foreground">
                                {typeof zimmer.fields.zimmer_typ === 'object'
                                  ? zimmer.fields.zimmer_typ.label
                                  : zimmer.fields.zimmer_typ}
                              </span>
                            </span>
                          )}
                          {zimmer.fields.kapazitaet !== undefined && (
                            <span>
                              Kapazität: <span className="font-medium text-foreground">{zimmer.fields.kapazitaet}</span>
                            </span>
                          )}
                          {zimmer.fields.tagespreis !== undefined && (
                            <span>
                              Preis: <span className="font-medium text-foreground">{zimmer.fields.tagespreis} €/Nacht</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(2)}>
              <IconChevronLeft size={16} className="mr-1" />
              Zurück
            </Button>
            <Button
              onClick={() => setCurrentStep(4)}
              disabled={!selectedZimmer || !anreise || !abreise || nights === 0}
            >
              Weiter
              <IconChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Zusatzleistungen ── */}
      {currentStep === 4 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Zusatzleistungen wählen</h2>
            <p className="text-sm text-muted-foreground">Wähle optionale Zusatzleistungen für den Aufenthalt.</p>
          </div>

          {/* Neue Leistung anlegen */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLeistungDialogOpen(true)} className="gap-1.5">
              <IconPlus size={15} />
              Neue Leistung anlegen
            </Button>
          </div>

          <LeistungsverwaltungDialog
            open={leistungDialogOpen}
            onClose={() => setLeistungDialogOpen(false)}
            onSubmit={handleLeistungCreated}
          />

          {/* Gesamtkosten */}
          <BudgetTracker
            budget={gesamtpreis > 0 ? gesamtpreis : zimmerkosten}
            booked={zimmerkosten + leistungskosten}
            label="Gesamtkosten"
            showRemaining={false}
          />

          {leistungsverwaltung.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground border rounded-xl bg-card">
              <IconStar size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Keine Leistungen vorhanden.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {leistungsverwaltung.map(leistung => {
                const isSelected = selectedLeistungIds.has(leistung.record_id);
                const kategorieLabel = typeof leistung.fields.leistung_kategorie === 'object'
                  ? leistung.fields.leistung_kategorie?.label
                  : leistung.fields.leistung_kategorie;
                const preiseinheitLabel = typeof leistung.fields.preiseinheit === 'object'
                  ? leistung.fields.preiseinheit?.label
                  : leistung.fields.preiseinheit;
                return (
                  <button
                    key={leistung.record_id}
                    onClick={() => toggleLeistung(leistung.record_id)}
                    className={`w-full text-left flex items-center gap-3 p-4 rounded-xl border transition-colors overflow-hidden ${
                      isSelected
                        ? 'bg-primary/5 border-primary ring-1 ring-primary/30'
                        : 'bg-card hover:bg-accent hover:border-primary/30'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-primary' : 'bg-muted'}`}>
                      {isSelected
                        ? <IconCheck size={18} className="text-primary-foreground" />
                        : <IconStar size={18} className="text-muted-foreground" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium text-sm truncate ${isSelected ? 'text-primary' : ''}`}>
                          {leistung.fields.leistung_name ?? '(Kein Name)'}
                        </span>
                        {kategorieLabel && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{kategorieLabel}</span>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {leistung.fields.preis !== undefined && (
                          <span>
                            Preis: <span className="font-medium text-foreground">{leistung.fields.preis} €</span>
                            {preiseinheitLabel && ` ${preiseinheitLabel}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                      {isSelected && <IconCheck size={12} className="text-primary-foreground" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(3)}>
              <IconChevronLeft size={16} className="mr-1" />
              Zurück
            </Button>
            <Button onClick={() => setCurrentStep(5)}>
              Weiter
              <IconChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 5: Buchung bestätigen ── */}
      {currentStep === 5 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Buchung bestätigen</h2>
            <p className="text-sm text-muted-foreground">Überprüfe alle Angaben und erstelle die Buchung.</p>
          </div>

          {/* Zusammenfassung */}
          <Card className="overflow-hidden">
            <CardContent className="p-4 space-y-4">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Zusammenfassung</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {/* Kunde */}
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Kunde</p>
                  <p className="font-medium">
                    {[selectedKunde?.fields.vorname, selectedKunde?.fields.nachname].filter(Boolean).join(' ')}
                  </p>
                  {selectedKunde?.fields.email && (
                    <p className="text-muted-foreground text-xs truncate">{selectedKunde.fields.email}</p>
                  )}
                </div>

                {/* Zimmer */}
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Zimmer</p>
                  <p className="font-medium">{selectedZimmer?.fields.zimmer_name ?? '-'}</p>
                  {selectedZimmer?.fields.tagespreis !== undefined && (
                    <p className="text-muted-foreground text-xs">{selectedZimmer.fields.tagespreis} €/Nacht</p>
                  )}
                </div>

                {/* Zeitraum */}
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Zeitraum</p>
                  <p className="font-medium">
                    {anreise ? new Date(anreise).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                    {' → '}
                    {abreise ? new Date(abreise).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                  </p>
                  <p className="text-muted-foreground text-xs">{nights} Nacht{nights !== 1 ? 'e' : ''}</p>
                </div>

                {/* Katzen */}
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Katzen</p>
                  {Array.from(selectedKatzenIds).map(id => {
                    const k = katzenverwaltung.find(k => k.record_id === id);
                    return (
                      <p key={id} className="font-medium">{k?.fields.katze_name ?? id}</p>
                    );
                  })}
                </div>

                {/* Zusatzleistungen */}
                {selectedLeistungen.length > 0 && (
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground text-xs mb-1">Zusatzleistungen</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedLeistungen.map(l => (
                        <span key={l.record_id} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                          {l.fields.leistung_name} {l.fields.preis !== undefined ? `(${l.fields.preis} €)` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gesamtpreis */}
                <div className="sm:col-span-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Zimmerkosten ({nights} Nacht{nights !== 1 ? 'e' : ''})</span>
                    <span className="font-medium">{zimmerkosten.toFixed(2)} €</span>
                  </div>
                  {leistungskosten > 0 && (
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm text-muted-foreground">Zusatzleistungen</span>
                      <span className="font-medium">{leistungskosten.toFixed(2)} €</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t">
                    <span className="font-semibold">Gesamtpreis</span>
                    <span className="font-bold text-lg">{gesamtpreis.toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Zusätzliche Felder */}
          <div className="space-y-4">
            {/* Buchungsstatus */}
            <div className="space-y-1">
              <Label htmlFor="buchungsstatus">Buchungsstatus</Label>
              <Select value={buchungsstatus} onValueChange={setBuchungsstatus}>
                <SelectTrigger id="buchungsstatus">
                  <SelectValue placeholder="Status wählen" />
                </SelectTrigger>
                <SelectContent>
                  {(LOOKUP_OPTIONS['buchungsverwaltung']?.buchungsstatus ?? []).map(opt => (
                    <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Zahlungsstatus */}
            <div className="space-y-1">
              <Label htmlFor="zahlungsstatus">Zahlungsstatus</Label>
              <Select value={zahlungsstatus} onValueChange={setZahlungsstatus}>
                <SelectTrigger id="zahlungsstatus">
                  <SelectValue placeholder="Zahlungsstatus wählen" />
                </SelectTrigger>
                <SelectContent>
                  {(LOOKUP_OPTIONS['buchungsverwaltung']?.zahlungsstatus ?? []).map(opt => (
                    <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Anzahlung */}
            <div className="space-y-1">
              <Label htmlFor="anzahlung">Anzahlung (€, optional)</Label>
              <Input
                id="anzahlung"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={anzahlung}
                onChange={e => setAnzahlung(e.target.value)}
              />
            </div>

            {/* Buchungshinweise */}
            <div className="space-y-1">
              <Label htmlFor="buchungshinweise">Buchungshinweise (optional)</Label>
              <Textarea
                id="buchungshinweise"
                placeholder="Besondere Hinweise oder Wünsche..."
                value={buchungshinweise}
                onChange={e => setBuchungshinweise(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {/* Fehlermeldung */}
          {submitError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {submitError}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setCurrentStep(4)}>
              <IconChevronLeft size={16} className="mr-1" />
              Zurück
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !selectedKunde || !selectedZimmer || !anreise || !abreise}
            >
              {submitting ? (
                <>
                  <IconLoader2 size={16} className="mr-2 animate-spin" />
                  Wird angelegt...
                </>
              ) : (
                <>
                  <IconCheck size={16} className="mr-2" />
                  Buchung anlegen
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
