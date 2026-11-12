"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import {
  BookOpen, Calculator, Coins, Receipt, CalendarClock, ListChecks,
  HandHeart, ExternalLink, ShieldAlert, Info,
} from "lucide-react";

/**
 * Fase 4 — Guia contextual (#/guia), contingut GRATUÏT per a tots els plans
 * (Taula 8 de la proposta: captació i SEO).
 *
 * Drets i obligacions (LAU), fiança i garanties amb calculadora, despeses,
 * actualització de la renda, checklist de clàusules i ajudes vigents
 * (/api/aid, taula editorial RentalAid amb font oficial i data de revisió).
 *
 * Tot el contingut és orientatiu, amb enllaç a la font oficial i data de
 * revisió; mai no substitueix l'assessorament jurídic.
 */

interface Aid {
  code: string;
  title: string;
  titleEs: string | null;
  description: string;
  descriptionEs: string | null;
  scope: string;
  amount: string | null;
  audience: string | null;
  audienceEs: string | null;
  status: string;
  url: string;
  source: string;
  lastReviewedAt: string;
}

const S = {
  ca: {
    title: "Guia del lloguer: drets, fiança, despeses i ajudes",
    intro:
      "Tot el que convé tenir clar abans de signar un contracte de lloguer a Catalunya, amb enllaç a les fonts oficials. Informació orientativa amb data de revisió: no substitueix l'assessorament jurídic ni el text vigent de la norma.",
    updated: "Revisió del contingut",
    s1t: "Drets i obligacions bàsiques",
    s1: [
      "El contracte d'arrendament d'habitatge es regeix per la Llei d'Arrendaments Urbans (LAU, Llei 29/1994). Tens dret a un contracte per escrit, a l'ús de l'habitatge com a domicili i a la pròrroga obligatòria fins a 5 anys (7 si el propietari és una empresa) si pagues la renda.",
      "El propietari ha de lliurar l'habitatge en condicions d'habitabilitat i fer les reparacions necessàries per mantenir-lo; tu has de servir-te'n com a domicili i pagar la renda en els termes pactats.",
      "A Catalunya, la fiança s'ha de dipositar a l'Incasòl i els contractes s'han de comunicar al registre; això és una obligació del propietari, no teva.",
      "L'extinció del contracte no permet que el propietari et faci fora de forma immediata ni tallar-te subministraments: només un procediment judicial de desnonament ho pot fer (amb els supòsits legals corresponents).",
    ],
    s2t: "Fiança i garanties: quant es paga i quan es retorna",
    s2: [
      "Fiança legal: 1 mes de renda (la cobreix la llei per a habitatges).",
      "Garanties addicionals (aval, dipòsit extra...): el propietari no pot exigir més de 2 mensualitats addicionals en total per a habitatge habitual (art. 36 LAU).",
      "Devolució: la fiança s'ha de retornar en 1 mes des de l'entrega de les claus (2 mesos si hi ha garantia addicional), descomptant només els deutes degudament justificats.",
      "Els imports de fiança i garanties no es poden actualitzar durant el contracte.",
    ],
    s2calcTitle: "Calculadora de fiança i garanties",
    s2calcRent: "Renda mensual pactada (€)",
    s2calcFianza: "Fiança legal (1 mes)",
    s2calcGarantia: "Garantia addicional màxima (2 mesos)",
    s2calcTotal: "Màxim total a lliurar en signar",
    s2calcNote:
      "Amb la renda introduïda: la llei fixa la fiança en 1 mes; les garanties addicionals no poden passar de 2 mesos. Si et demanen més de 3 mensualitats en total, és il·legal per a un habitatge habitual.",
    s3t: "Despeses: qui paga què",
    s3: [
      "IVA: el 10 % sobre la renda el paga el propietari (habitatge habitual). No el pots cobrar a part.",
      "Comissió immobiliària: a Catalunya, la Llei 13/2023 de la Generalitat fa que els qui contracten el servei el paguin — per regla general, els gastos d'agència de la cotitulació els paga el propietari, no l'inquilí.",
      "Subministraments (llum, aigua, gas): els paga l'inquilí si el contracte ho pacta; comprova qui és el titular i si hi ha deute pendent abans de signar.",
      "IBI i altres tributs sobre l'immoble: els paga el propietari, tret que el contracte ho pacti expressament (revisa-ho!).",
    ],
    s4t: "Actualització de la renda",
    s4: [
      "La renda es pot actualitzar un cop l'any en la data que consti al contracte, segons l'índex que s'hi hagi pactat.",
      "Si el contracte no diu res, s'aplica l'IPC general (art. 18 LAU).",
      "Hi ha límits temporals i un índex de referència estatal que poden afectar l'actualització: consulta el text vigent de la LAU i el DOGC/BOE abans d'acceptar una clàusula d'actualització agresiva.",
      "A municipis amb àrea de mercat residencial tensat (resolucions del Departament de Territori) hi ha límits adicionals sobre la renda dels nous contractes.",
    ],
    s5t: "Checklist de clàusules abans de signar",
    s5: [
      "Identitat i titularitat: que qui signa és el propietari (o gestor autoritzat) i que l'habitatge és l'objecte del contracte.",
      "Renda i pagaments annexos: què inclou (comunitat, pàrquing, traster) i què no.",
      "Actualització: índex i límits, i quan s'aplica.",
      "Durada i pròrrogues: contracte mínim 1 any amb pròrroga obligatòria fins a 5/7 anys; revisa les condicions de retirada anticipada (la LAU limita la compensació màx. a 1 mes de renda per any pendent... comprova la clàusula).",
      "Fiança vs garanties: que no t'exigeixin més de 1 mes de fiança + 2 de garanties addicionals.",
      "Obrés i estat: inventari amb fotografies, estat del moblament i qui paga cada reparació.",
      "Clàusules abusives: càrrecs per gestió immobiliària a càrrec teu, penals desproporcionats, prohibició de registre d'habitants o de titularitat de subministraments a nom teu.",
    ],
    s6t: "Ajudes vigents al lloguer",
    s6intro:
      "Convocatories i línies d'ajut amb font oficial i data de darrera revisió editorial. Les convocatories tenen terminis i crèdits propis: verifica sempre la font oficial abans de presentar cap sol·licitud.",
    aidStatus: { VIGENTE: "Vigent", CONVOCATORIA_OBERTA: "Convocatòria oberta", CONVOCATORIA_TANCADA: "Convocatòria tancada", FINALIZADA: "Finalitzada" },
    aidRequisits: "A qui va dirigit",
    aidRevisat: "Contingut revisat",
    s7t: "Fonts oficials",
    fonts: [
      { t: "LAU — Llei 29/1994, text consolidat (BOE)", u: "https://www.boe.es/buscar/act.php?id=BOE-A-1994-14703" },
      { t: "Incasòl — registre de fiances de lloguer (Gencat)", u: "https://incasol.gencat.cat/" },
      { t: "Agència de l'Habitatge de Catalunya", u: "https://habitatge.gencat.cat/" },
      { t: "Ministerio de Vivienda y Agenda Urbana", u: "https://www.vivienda.gob.es/" },
      { t: "DOGC — diari oficial de la Generalitat", u: "https://dogc.gencat.cat/" },
    ],
    consultorNote:
      "¿És raonable el preu que et demanen? Amb Premium pots veure la banda de referència P25–P75, la posició del teu preu i l'esforç econòmic del municipi amb dades oficials.",
    consultorCta: "Veure les referències oficials (mapa)",
    loadingAids: "Carregant ajudes…",
    aidsError: "Ara mateix no podem carregar les ajudes. Torna-ho a provar més tard.",
    noAids: "No hi ha ajudes publicades ara mateix. Consulta la font oficial.",
  },
  es: {
    title: "Guía del alquiler: derechos, fianza, gastos y ayudas",
    intro:
      "Todo lo que conviene tener claro antes de firmar un contrato de alquiler en Cataluña, con enlace a las fuentes oficiales. Información orientativa con fecha de revisión: no sustituye el asesoramiento jurídico ni el texto vigente de la norma.",
    updated: "Revisión del contenido",
    s1t: "Derechos y obligaciones básicas",
    s1: [
      "El contrato de arrendamiento de vivienda se rige por la Ley de Arrendamientos Urbanos (LAU, Ley 29/1994). Tienes derecho a un contrato por escrito, al uso de la vivienda como domicilio y a la prórroga obligatoria hasta 5 años (7 si el propietario es una empresa) si pagas la renta.",
      "El propietario debe entregar la vivienda en condiciones de habitabilidad y hacer las reparaciones necesarias para mantenerla; tú debes servirte de ella como domicilio y pagar la renta en los términos pactados.",
      "En Cataluña, la fianza debe depositarse en el Incasòl y los contratos deben comunicarse al registro; esa es una obligación del propietario, no tuya.",
      "La extinción del contrato no permite que el propietario te eche de forma inmediata ni que te corte los suministros: solo un procedimiento judicial de desahucio puede hacerlo (con los supuestos legales correspondientes).",
    ],
    s2t: "Fianza y garantías: cuánto se paga y cuándo se devuelve",
    s2: [
      "Fianza legal: 1 mes de renta (la cubre la ley para viviendas).",
      "Garantías adicionales (aval, depósito extra...): el propietario no puede exigir más de 2 mensualidades adicionales en total para vivienda habitual (art. 36 LAU).",
      "Devolución: la fianza debe devolverse en 1 mes desde la entrega de las llaves (2 meses si hay garantía adicional), descontando solo los deudas debidamente justificados.",
      "Los importes de fianza y garantías no se pueden actualizar durante el contrato.",
    ],
    s2calcTitle: "Calculadora de fianza y garantías",
    s2calcRent: "Renta mensual pactada (€)",
    s2calcFianza: "Fianza legal (1 mes)",
    s2calcGarantia: "Garantía adicional máxima (2 meses)",
    s2calcTotal: "Máximo total a entregar al firmar",
    s2calcNote:
      "Con la renta introducida: la ley fija la fianza en 1 mes; las garantías adicionales no pueden pasar de 2 meses. Si te piden más de 3 mensualidades en total, es ilegal para una vivienda habitual.",
    s3t: "Gastos: quién paga qué",
    s3: [
      "IVA: el 10 % sobre la renta lo paga el propietario (vivienda habitual). No puedes cobrársele aparte.",
      "Comisión inmobiliaria: en Cataluña, la Ley 13/2023 de la Generalitat hace que quien contrate el servicio lo pague — por regla general, los gastos de agencia de la cotitulación los paga el propietario, no el inquilino.",
      "Suministros (luz, agua, gas): los paga el inquilino si el contrato lo pacta; comprueba quién es el titular y si hay deuda pendiente antes de firmar.",
      "IBI y otros tributos sobre el inmueble: los paga el propietario, salvo que el contrato lo pacte expresamente (¡revísalo!).",
    ],
    s4t: "Actualización de la renta",
    s4: [
      "La renta se puede actualizar una vez al año en la fecha que conste en el contrato, según el índice que se haya pactado.",
      "Si el contrato no dice nada, se aplica el IPC general (art. 18 LAU).",
      "Hay límites temporales y un índice de referencia estatal que pueden afectar la actualización: consulta el texto vigente de la LAU y el DOGC/BOE antes de aceptar una cláusula de actualización agresiva.",
      "En municipios con área de mercado residencial tensionado (resoluciones del Departamento de Territorio) hay límites adicionales sobre la renta de los nuevos contratos.",
    ],
    s5t: "Checklist de cláusulas antes de firmar",
    s5: [
      "Identidad y titularidad: que quien firma es el propietario (o gestor autorizado) y que la vivienda es el objeto del contrato.",
      "Renta y pagos anexos: qué incluye (comunidad, parking, trastero) y qué no.",
      "Actualización: índice y límites, y cuándo se aplica.",
      "Duración y prórrogas: contrato mínimo 1 año con prórroga obligatoria hasta 5/7 años; revisa las condiciones de retirada anticipada (la LAU limita la compensación máx. a 1 mes de renta por año pendiente... comprueba la cláusula).",
      "Fianza vs garantías: que no te exijan más de 1 mes de fianza + 2 de garantías adicionales.",
      "Obras y estado: inventario con fotografías, estado del moblaje y quién paga cada reparación.",
      "Cláusulas abusivas: cargos por gestión inmobiliaria a tu cargo, penales desproporcionados, prohibición de registro de habitantes o de titularidad de suministros a tu nombre.",
    ],
    s6t: "Ayudas vigentes al alquiler",
    s6intro:
      "Convocatorias y líneas de ayuda con fuente oficial y fecha de última revisión editorial. Las convocatorias tienen plazos y créditos propios: verifica siempre la fuente oficial antes de presentar cualquier solicitud.",
    aidStatus: { VIGENTE: "Vigente", CONVOCATORIA_OBERTA: "Convocatoria abierta", CONVOCATORIA_TANCADA: "Convocatoria cerrada", FINALIZADA: "Finalizada" },
    aidRequisits: "A quién va dirigido",
    aidRevisat: "Contenido revisado",
    s7t: "Fuentes oficiales",
    fonts: [
      { t: "LAU — Ley 29/1994, texto consolidado (BOE)", u: "https://www.boe.es/buscar/act.php?id=BOE-A-1994-14703" },
      { t: "Incasòl — registro de fianzas de alquiler (Gencat)", u: "https://incasol.gencat.cat/" },
      { t: "Agencia de la Vivienda de Cataluña", u: "https://habitatge.gencat.cat/" },
      { t: "Ministerio de Vivienda y Agenda Urbana", u: "https://www.vivienda.gob.es/" },
      { t: "DOGC — diario oficial de la Generalitat", u: "https://dogc.gencat.cat/" },
    ],
    consultorNote:
      "¿Es razonable el precio que te piden? Con Premium puedes ver la banda de referencia P25–P75, la posición de tu precio y el esfuerzo económico del municipio con datos oficiales.",
    consultorCta: "Ver las referencias oficiales (mapa)",
    loadingAids: "Cargando ayudas…",
    aidsError: "Ahora mismo no podemos cargar las ayudas. Inténtalo más tarde.",
    noAids: "No hay ayudas publicadas ahora mismo. Consulta la fuente oficial.",
  },
} as const;

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-[#e5e1da] p-6">
      <h2 className="font-bold text-lg text-[#0f2e21] flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-lg bg-[#f0ede8] flex items-center justify-center shrink-0">{icon}</span>
        {title}
      </h2>
      <div className="space-y-2 text-sm text-[#2c352c] leading-relaxed">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((b, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#e8673c] shrink-0" />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

export default function GuiaView() {
  const { locale, navigate } = useApp();
  const ca = locale === "ca";
  const t = S[ca ? "ca" : "es"];
  const [aids, setAids] = useState<Aid[] | null>(null);
  const [aidsError, setAidsError] = useState(false);
  const [rent, setRent] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/aid", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelled) setAids(Array.isArray(d.aids) ? d.aids : []); })
      .catch(() => { if (!cancelled) setAidsError(true); });
    return () => { cancelled = true; };
  }, []);

  const rentNum = parseFloat(rent);
  const fianza = Number.isFinite(rentNum) && rentNum > 0 ? rentNum : null;
  const garantia = fianza !== null ? fianza * 2 : null;
  const total = fianza !== null ? fianza + (garantia ?? 0) : null;
  const fmt = (v: number) => `${v.toFixed(0)} €`;

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-12 space-y-4">
      <h1 className="text-3xl font-extrabold flex items-center gap-2 text-[#0f2e21]">
        <BookOpen className="w-7 h-7" />
        {t.title}
      </h1>
      <p className="text-sm text-[#4b5349] leading-relaxed">{t.intro}</p>

      {/* drets i obligacions */}
      <Card icon={<ShieldAlert className="w-4 h-4 text-[#0f2e21]" />} title={t.s1t}>
        <Bullets items={t.s1} />
      </Card>

      {/* fiança + calculadora */}
      <Card icon={<Calculator className="w-4 h-4 text-[#0f2e21]" />} title={t.s2t}>
        <Bullets items={t.s2} />
        <div className="mt-4 rounded-xl border border-[#e5e1da] bg-[#faf9f7] p-4">
          <div className="font-semibold text-sm text-[#0f2e21] mb-3">{t.s2calcTitle}</div>
          <label className="text-xs text-[#6b6f68]">{t.s2calcRent}</label>
          <input
            inputMode="decimal"
            value={rent}
            onChange={(e) => setRent(e.target.value.replace(/[^\d.,]/g, "").slice(0, 8))}
            placeholder="850"
            className="mt-1 w-full max-w-[200px] px-3 py-2 rounded-lg border border-[#e5e1da] text-sm outline-none focus:border-[#e8673c]"
          />
          {fianza !== null && garantia !== null && total !== null && (
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-white border border-[#e5e1da] py-2">
                <div className="font-black text-[#0f2e21]">{fmt(fianza)}</div>
                <div className="text-[10px] text-[#6b6f68] leading-tight">{t.s2calcFianza}</div>
              </div>
              <div className="rounded-lg bg-white border border-[#e5e1da] py-2">
                <div className="font-black text-[#0f2e21]">{fmt(garantia)}</div>
                <div className="text-[10px] text-[#6b6f68] leading-tight">{t.s2calcGarantia}</div>
              </div>
              <div className="rounded-lg bg-[#0f2e21] text-white py-2">
                <div className="font-black">{fmt(total)}</div>
                <div className="text-[10px] opacity-80 leading-tight">{t.s2calcTotal}</div>
              </div>
            </div>
          )}
          <p className="mt-3 text-[11px] text-[#6b6f68] flex gap-1.5">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            {t.s2calcNote}
          </p>
        </div>
      </Card>

      {/* despeses */}
      <Card icon={<Coins className="w-4 h-4 text-[#0f2e21]" />} title={t.s3t}>
        <Bullets items={t.s3} />
      </Card>

      {/* actualització renda */}
      <Card icon={<CalendarClock className="w-4 h-4 text-[#0f2e21]" />} title={t.s4t}>
        <Bullets items={t.s4} />
      </Card>

      {/* checklist */}
      <Card icon={<ListChecks className="w-4 h-4 text-[#0f2e21]" />} title={t.s5t}>
        <Bullets items={t.s5} />
      </Card>

      {/* ajudes */}
      <Card icon={<HandHeart className="w-4 h-4 text-[#0f2e21]" />} title={t.s6t}>
        <p className="text-sm text-[#4b5349]">{t.s6intro}</p>
        {aidsError && <p className="text-sm text-[#b0431c]">{t.aidsError}</p>}
        {aids === null && !aidsError && <p className="text-sm text-[#6b6f68]">{t.loadingAids}</p>}
        {aids !== null && aids.length === 0 && !aidsError && <p className="text-sm text-[#6b6f68]">{t.noAids}</p>}
        {aids !== null && aids.length > 0 && (
          <div className="mt-3 space-y-3">
            {aids.map((a) => (
              <div key={a.code} className="rounded-xl border border-[#e5e1da] p-4 bg-[#faf9f7]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sm text-[#0f2e21]">{ca ? a.title : a.titleEs || a.title}</span>
                  <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${
                    a.status === "CONVOCATORIA_OBERTA"
                      ? "bg-[#e6f4ea] text-[#1e7a41] border-[#bfe3cc]"
                      : "bg-[#f0ede8] text-[#4b5349] border-[#e5e1da]"
                  }`}>
                    {t.aidStatus[a.status as keyof typeof t.aidStatus] ?? a.status}
                  </span>
                  {a.amount && <span className="text-xs font-bold text-[#e8673c]">{a.amount}</span>}
                </div>
                <p className="mt-1.5 text-sm text-[#2c352c]">{ca ? a.description : a.descriptionEs || a.description}</p>
                {a.audience && (
                  <p className="mt-1 text-xs text-[#4b5349]">
                    <b>{t.aidRequisits}:</b> {ca ? a.audience : a.audienceEs || a.audience}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6b6f68]">
                  <span>
                    {a.source} · {t.aidRevisat}: {new Date(a.lastReviewedAt).toLocaleDateString(ca ? "ca-ES" : "es-ES")}
                  </span>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 font-semibold text-[#0f2e21] hover:text-[#e8673c]"
                  >
                    {ca ? "Font oficial" : "Fuente oficial"} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* referència oficial del preu (upsell contextual suau) */}
      <section className="rounded-2xl border-2 border-[#0f2e21] p-6 bg-white">
        <h2 className="font-bold text-lg text-[#0f2e21] flex items-center gap-2">
          <Receipt className="w-5 h-5" />
          {ca ? "La referència del preu, al mapa" : "La referencia del precio, en el mapa"}
        </h2>
        <p className="mt-2 text-sm text-[#2c352c]">{t.consultorNote}</p>
        <button
          onClick={() => navigate("/mapa")}
          className="mt-3 px-4 py-2 rounded-xl bg-[#e8673c] text-white text-sm font-bold hover:bg-[#d95a31]"
        >
          {t.consultorCta}
        </button>
      </section>

      {/* fonts */}
      <Card icon={<ExternalLink className="w-4 h-4 text-[#0f2e21]" />} title={t.s7t}>
        <ul className="space-y-1.5">
          {t.fonts.map((f) => (
            <li key={f.u}>
              <a href={f.u} target="_blank" rel="noopener noreferrer nofollow" className="text-[#0f2e21] font-medium hover:text-[#e8673c] inline-flex items-center gap-1">
                {f.t} <ExternalLink className="w-3 h-3" />
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-[#6b6f68]">
          {t.updated}: {new Date().toLocaleDateString(ca ? "ca-ES" : "es-ES")} · Preureal no presta assessorament jurídic; aquesta guia és contingut informatiu sobre normativa pública.
        </p>
      </Card>
    </div>
  );
}
