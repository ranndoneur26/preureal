"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import { FileText, Home, Scale, ShoppingCart, X, AlertCircle, Loader2 } from "lucide-react";

/**
 * v38.8 — secció «Informes individuals» de la pàgina de preus: 3 productes de
 * PAGAMENT ÚNIC (Stripe mode payment, sense subscripció):
 *  - Informe municipal PDF (4,99 €): el mateix document de 8 pàgines que Premium.
 *  - Valoració d'habitatge (6,99 €): horquilla del motor v2 per a UNA vivenda.
 *  - Comparativa de municipis (7,99 €): fins a 6 municipis en un PDF.
 * Els preus venen de /api/reports/shop/catalog (mateixa font que el checkout):
 * mai preus durs al client. Sense Stripe configurat + DEMO_CHECKOUT → la
 * compra es simula i s'entrega l'enllaç de descàrrega (mateix patró que els plans).
 */

interface CatalogProduct {
  kind: "INFORME_MUNICIPI" | "VALORACIO" | "COMPARATIVA";
  priceCents: number;
  nameCa: string;
  nameEs: string;
  descCa: string;
  descEs: string;
}

interface MuniPick {
  code: string;
  name: string;
}

type ShopKind = "INFORME_MUNICIPI" | "VALORACIO" | "COMPARATIVA";

export default function ReportsShopSection() {
  const { t, locale, auth, navigate } = useApp();
  const ca = locale === "ca";
  const ti = t.plans.informes;
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [openKind, setOpenKind] = useState<ShopKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [demoUrl, setDemoUrl] = useState<string | null>(null);

  // municipi de l'informe municipal / valoració (un estat per formulari)
  const [muniMuni, setMuniMuni] = useState<MuniPick | null>(null);
  const [valMuni, setValMuni] = useState<MuniPick | null>(null);
  const [surface, setSurface] = useState("");
  const [rooms, setRooms] = useState("");
  const [estat, setEstat] = useState("");
  const [compMunis, setCompMunis] = useState<MuniPick[]>([]);

  useEffect(() => {
    fetch("/api/reports/shop/catalog")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.products) setCatalog(d.products);
      })
      .catch(() => {});
  }, []);

  const priceEur = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
  const productOf = (kind: ShopKind) => catalog.find((p) => p.kind === kind) || null;

  const buy = async (kind: ShopKind, body: Record<string, unknown>) => {
    setNotice(null);
    if (!auth.user) {
      setNotice(ti.needLogin);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reports/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.ok && d.mode === "STRIPE" && d.url) {
        window.location.href = d.url;
        return;
      }
      if (d.ok && d.mode === "DEMO") {
        setDemoUrl(d.downloadUrl);
        setNotice(ti.demoOk);
        return;
      }
      if (d.error === "NO_DATA") setNotice(d.message || ti.errNoData);
      else if (d.error === "EMAIL_NOT_VERIFIED") setNotice(ti.emailNotVerified);
      else if (d.error === "UNAUTHENTICATED") setNotice(ti.needLogin);
      else setNotice(d.message || ti.errGeneric);
    } catch {
      setNotice(ti.errGeneric);
    } finally {
      setBusy(false);
    }
  };

  const startBuy = (kind: ShopKind) => {
    if (!auth.user) {
      setNotice(ti.needLogin);
      navigate("/registre");
      return;
    }
    if (kind === "INFORME_MUNICIPI") {
      if (!muniMuni) return;
      void buy(kind, { kind, mun: muniMuni.code });
    } else if (kind === "VALORACIO") {
      if (!valMuni) return;
      void buy(kind, {
        kind,
        mun: valMuni.code,
        surfaceM2: surface !== "" ? Number(surface) : undefined,
        rooms: rooms !== "" ? Number(rooms) : undefined,
        estat: estat || undefined,
      });
    } else {
      if (compMunis.length < 2) {
        setNotice(ti.minMunis);
        return;
      }
      void buy(kind, { kind, muns: compMunis.map((m) => m.code) });
    }
  };

  const cards: Array<{ kind: ShopKind; icon: React.ReactNode; name: string; feats: readonly string[] }> = [
    { kind: "INFORME_MUNICIPI", icon: <FileText className="w-4 h-4" />, name: ti.muni.name, feats: ti.muni.feats },
    { kind: "VALORACIO", icon: <Home className="w-4 h-4" />, name: ti.val.name, feats: ti.val.feats },
    { kind: "COMPARATIVA", icon: <Scale className="w-4 h-4" />, name: ti.comp.name, feats: ti.comp.feats },
  ];

  return (
    <div className="mt-16">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-extrabold tracking-tight flex items-center justify-center gap-2">
          <ShoppingCart className="w-6 h-6 text-ember" />
          {ti.title}
        </h2>
        <p className="mt-3 text-moss text-sm">{ti.subtitle}</p>
      </div>

      {notice && (
        <div className="mt-6 max-w-2xl mx-auto rounded-xl bg-mintsoft border border-mintline text-green2 text-sm p-4 flex gap-2 items-start">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">
            {notice}
            {demoUrl && (
              <a href={demoUrl} className="ml-2 underline font-bold">
                {ti.download}
              </a>
            )}
          </span>
          <button onClick={() => { setNotice(null); setDemoUrl(null); }} aria-label="tancar">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="mt-8 grid md:grid-cols-3 gap-5 items-stretch">
        {cards.map((c) => {
          const p = productOf(c.kind);
          const price = p ? priceEur(p.priceCents) : "…";
          const desc = p ? (ca ? p.descCa : p.descEs) : "";
          return (
            <div key={c.kind} className="relative rounded-2xl border border-line bg-card p-6 flex flex-col">
              <div className="font-bold flex items-center gap-2">{c.icon}{c.name}</div>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-3xl font-black text-pine">{price}</span>
                <span className="text-xs mb-1 text-stone">{ti.oneOff}</span>
              </div>
              <p className="mt-3 text-xs text-stone leading-relaxed">{desc}</p>
              <ul className="mt-4 space-y-2 text-sm text-moss flex-1">
                {c.feats.map((f, i) => (
                  <li key={i} className="flex gap-2 items-start">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-ember shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setOpenKind(openKind === c.kind ? null : c.kind)}
                className="mt-5 w-full py-2.5 rounded-xl font-bold text-sm bg-pine text-white hover:bg-pine2 transition-colors"
              >
                {openKind === c.kind ? "×" : ti.buy}
              </button>
            </div>
          );
        })}
      </div>

      {openKind === "INFORME_MUNICIPI" && (
        <ShopForm title={ti.muni.name}>
          <MuniSearch label={ti.formMuni} placeholder={ti.formMuniPh} selected={muniMuni} onPick={(m) => setMuniMuni(m.code ? m : null)} />
          <PayRow>
            <PayButton
              disabled={busy || !muniMuni}
              onClick={() => startBuy("INFORME_MUNICIPI")}
              busy={busy}
              label={`${ti.payCta} ${productOf("INFORME_MUNICIPI") ? priceEur(productOf("INFORME_MUNICIPI")!.priceCents) : ""}`}
            />
          </PayRow>
        </ShopForm>
      )}

      {openKind === "VALORACIO" && (
        <ShopForm title={ti.val.name}>
          <MuniSearch label={ti.formMuni} placeholder={ti.formMuniPh} selected={valMuni} onPick={(m) => setValMuni(m.code ? m : null)} />
          <div className="grid sm:grid-cols-3 gap-3 mt-3">
            <Field label={ti.formM2}>
              <input
                type="number"
                min={5}
                max={500}
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white text-ink"
                placeholder="85"
              />
            </Field>
            <Field label={ti.formRooms}>
              <input
                type="number"
                min={0}
                max={10}
                value={rooms}
                onChange={(e) => setRooms(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white text-ink"
                placeholder="3"
              />
            </Field>
            <Field label={ti.formEstat}>
              <select
                value={estat}
                onChange={(e) => setEstat(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white text-ink"
              >
                <option value="">—</option>
                <option value="A_REFORMAR">{ti.estats.A_REFORMAR}</option>
                <option value="BON_ESTAT">{ti.estats.BON_ESTAT}</option>
                <option value="REFORMADA">{ti.estats.REFORMADA}</option>
                <option value="OBRA_NOVA">{ti.estats.OBRA_NOVA}</option>
              </select>
            </Field>
          </div>
          <PayRow>
            <PayButton
              disabled={busy || !valMuni}
              onClick={() => startBuy("VALORACIO")}
              busy={busy}
              label={`${ti.payCta} ${productOf("VALORACIO") ? priceEur(productOf("VALORACIO")!.priceCents) : ""}`}
            />
          </PayRow>
        </ShopForm>
      )}

      {openKind === "COMPARATIVA" && (
        <ShopForm title={ti.comp.name}>
          <div className="text-xs font-semibold text-stone">{ti.formMunis}</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {compMunis.map((m) => (
              <span key={m.code} className="inline-flex items-center gap-1 bg-sand text-pine text-xs font-semibold px-2.5 py-1.5 rounded-full">
                {m.name}
                <button
                  onClick={() => setCompMunis(compMunis.filter((x) => x.code !== m.code))}
                  aria-label={`treure ${m.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {compMunis.length === 0 && <span className="text-xs text-stone">{ti.minMunis}</span>}
          </div>
          <div className="mt-3">
            <MuniSearch
              label={ti.add}
              placeholder={ti.formMuniPh}
              selected={null}
              onPick={(m) => {
                setNotice(null);
                if (compMunis.some((x) => x.code === m.code)) return;
                if (compMunis.length >= 6) {
                  setNotice(ti.maxMunis);
                  return;
                }
                setCompMunis([...compMunis, m]);
              }}
            />
          </div>
          <PayRow>
            <PayButton
              disabled={busy || compMunis.length < 2}
              onClick={() => startBuy("COMPARATIVA")}
              busy={busy}
              label={`${ti.payCta} ${productOf("COMPARATIVA") ? priceEur(productOf("COMPARATIVA")!.priceCents) : ""}`}
            />
          </PayRow>
        </ShopForm>
      )}

      <div className="mt-6 text-center text-xs text-stone max-w-xl mx-auto">{ti.vat}</div>
    </div>
  );
}

/** Formulari inline d'un informe (contenidor amb títol). */
function ShopForm({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 max-w-2xl mx-auto rounded-2xl border border-line bg-cream p-5">
      <div className="text-sm font-bold text-pine mb-3">{title}</div>
      {children}
    </div>
  );
}

/** Cerca de municipis amb debounce contra /api/municipalities (mateixa API del comparador). */
function MuniSearch({
  label,
  placeholder,
  selected,
  onPick,
}: {
  label: string;
  placeholder: string;
  selected: MuniPick | null;
  onPick: (m: MuniPick) => void;
}) {
  const [q, setQ] = useState("");
  const [cands, setCands] = useState<MuniPick[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      const qn = q.trim();
      if (qn.length < 2) {
        setCands([]);
        return;
      }
      setLoading(true);
      fetch(`/api/municipalities?q=${encodeURIComponent(qn)}&limit=6`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setCands((d?.municipalities || []).map((m: { code: string; name: string }) => ({ code: m.code, name: m.name }))))
        .catch(() => setCands([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <label className="block text-xs font-semibold text-stone mb-1">{label}</label>
      {selected ? (
        <div className="flex items-center justify-between bg-sand text-pine text-sm font-semibold px-3 py-2 rounded-lg">
          <span>{selected.name}</span>
          <button onClick={() => { onPick({ code: "", name: "" }); setQ(""); }} aria-label="canviar">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white text-ink"
          />
          {open && (loading || cands.length > 0) && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-line rounded-lg shadow-lg overflow-hidden">
              {loading && (
                <div className="px-3 py-2 text-xs text-stone flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> …
                </div>
              )}
              {cands.map((m) => (
                <button
                  key={m.code}
                  onClick={() => { onPick(m); setOpen(false); setCands([]); setQ(""); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-cream"
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-stone mb-1">{label}</label>
      {children}
    </div>
  );
}

function PayRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex justify-end">{children}</div>;
}

function PayButton({ label, onClick, disabled, busy }: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-6 py-2.5 rounded-xl font-bold text-sm bg-ember text-white hover:bg-ember2 transition-colors disabled:opacity-60 inline-flex items-center gap-2"
    >
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
      {label}
    </button>
  );
}
