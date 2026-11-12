"use client";

import { useState } from "react";
import { Palette, Type, Ruler, Component, Moon, Sun } from "lucide-react";
import { useApp } from "@/components/app-context";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * #/design — Document del design system (v38.2).
 * Referència viva dels tokens (color, tipografia, espaiat) i dels components
 * bàsics. Font de veritat: src/app/globals.css (@theme inline). Si aquesta
 * pàgina i el CSS no coincideixen, el CSS mana.
 */

const PALETTE: Array<{ nom: string; classe: string; ús: { ca: string; es: string } }> = [
  { nom: "cream", classe: "bg-cream", ús: { ca: "Fons principal", es: "Fondo principal" } },
  { nom: "sand", classe: "bg-sand", ús: { ca: "Superfície subtil / hover", es: "Superficie sutil / hover" } },
  { nom: "card", classe: "bg-card", ús: { ca: "Targetes i inputs", es: "Tarjetas e inputs" } },
  { nom: "line", classe: "bg-line", ús: { ca: "Vores i separadors", es: "Bordes y separadores" } },
  { nom: "pine", classe: "bg-pine", ús: { ca: "Primari (botons, footer)", es: "Primario (botones, footer)" } },
  { nom: "pine2", classe: "bg-pine2", ús: { ca: "Hover del primari", es: "Hover del primario" } },
  { nom: "ember", classe: "bg-ember", ús: { ca: "Accent / CTA", es: "Acento / CTA" } },
  { nom: "ember2", classe: "bg-ember2", ús: { ca: "Hover de l'accent", es: "Hover del acento" } },
  { nom: "embersoft", classe: "bg-embersoft", ús: { ca: "Fons d'avís accent", es: "Fondo de aviso acento" } },
  { nom: "mintsoft", classe: "bg-mintsoft", ús: { ca: "Fons d'èxit", es: "Fondo de éxito" } },
  { nom: "mint", classe: "bg-mint", ús: { ca: "Verd d'èxit", es: "Verde de éxito" } },
  { nom: "ambersoft", classe: "bg-ambersoft", ús: { ca: "Fons d'avís", es: "Fondo de aviso" } },
  { nom: "ink", classe: "bg-ink", ús: { ca: "Text principal", es: "Texto principal" } },
  { nom: "moss", classe: "bg-moss", ús: { ca: "Text mitjà", es: "Texto medio" } },
  { nom: "stone", classe: "bg-stone", ús: { ca: "Text secundari", es: "Texto secundario" } },
];

const SPACING = [1, 2, 3, 4, 5, 6, 8, 10, 12];

export default function DesignView() {
  const { locale } = useApp();
  const ca = locale === "ca";
  const [demoInput, setDemoInput] = useState("");

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold flex items-center gap-3">
        <Palette className="w-7 h-7 text-ember" />
        {ca ? "Sistema de disseny" : "Sistema de diseño"}
      </h1>
      <p className="mt-3 text-[15px] text-moss leading-relaxed max-w-3xl">
        {ca
          ? "Tokens i components bàsics de Preureal. La font de veritat és src/app/globals.css (@theme inline): tots els colors tenen valor clar i fosc, i el tema segueix el sistema o el commutador del cantonada."
          : "Tokens y componentes básicos de Preureal. La fuente de verdad es src/app/globals.css (@theme inline): todos los colores tienen valor claro y oscuro, y el tema sigue al sistema o al conmutador de la esquina."}
      </p>
      <div className="mt-4 flex items-center gap-3 text-sm text-stone">
        <span>{ca ? "Prova-ho:" : "Pruébalo:"}</span>
        <ThemeToggle />
        <span className="inline-flex items-center gap-1"><Sun className="w-3.5 h-3.5" />/<Moon className="w-3.5 h-3.5" /></span>
      </div>

      {/* Colors */}
      <h2 className="mt-10 font-bold text-xl flex items-center gap-2"><Palette className="w-5 h-5 text-pine" /> {ca ? "Color" : "Color"}</h2>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {PALETTE.map((c) => (
          <div key={c.nom} className="rounded-xl border border-line bg-card overflow-hidden">
            <div className={`h-14 ${c.classe}`} />
            <div className="p-3">
              <div className="font-mono text-xs font-bold">{c.nom}</div>
              <div className="text-xs text-stone mt-0.5">{ca ? c.ús.ca : c.ús.es}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tipografia */}
      <h2 className="mt-10 font-bold text-xl flex items-center gap-2"><Type className="w-5 h-5 text-pine" /> {ca ? "Tipografia" : "Tipografía"}</h2>
      <div className="mt-4 rounded-2xl border border-line bg-card p-5 space-y-3">
        <div className="text-3xl font-extrabold">{ca ? "Títol hero — Extrabold 30px" : "Título hero — Extrabold 30px"}</div>
        <div className="text-xl font-bold">{ca ? "Encapçalament de secció — Bold 20px" : "Encabezado de sección — Bold 20px"}</div>
        <div className="text-[15px] text-moss leading-relaxed">
          {ca
            ? "Cos de text — 15px, alçada de línia ampla (leading-relaxed). La font és el stack del sistema: no carreguem cap webfont, per rendiment."
            : "Cuerpo de texto — 15px, altura de línea amplia (leading-relaxed). La fuente es el stack del sistema: no cargamos ninguna webfont, por rendimiento."}
        </div>
        <div className="text-xs text-stone">{ca ? "Etiqueta petita — 12px, per metadades i fonts" : "Etiqueta pequeña — 12px, para metadatos y fuentes"}</div>
      </div>

      {/* Espaiat */}
      <h2 className="mt-10 font-bold text-xl flex items-center gap-2"><Ruler className="w-5 h-5 text-pine" /> {ca ? "Espaiat (escala Tailwind)" : "Espaciado (escala Tailwind)"}</h2>
      <div className="mt-4 rounded-2xl border border-line bg-card p-5 flex flex-wrap items-end gap-4">
        {SPACING.map((s) => (
          <div key={s} className="text-center">
            <div className="w-{s} h-6 bg-pine rounded" style={{ width: `${s * 4}px` }} />
            <div className="text-[10px] text-stone mt-1">{s}</div>
          </div>
        ))}
      </div>

      {/* Components */}
      <h2 className="mt-10 font-bold text-xl flex items-center gap-2"><Component className="w-5 h-5 text-pine" /> {ca ? "Components" : "Componentes"}</h2>
      <div className="mt-4 rounded-2xl border border-line bg-card p-5 space-y-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-stone mb-2">{ca ? "Botons" : "Botones"}</div>
          <div className="flex flex-wrap gap-2">
            <button className="px-4 py-2 rounded-lg bg-ember text-white text-sm font-bold hover:bg-ember2 transition-colors">{ca ? "Primari (CTA)" : "Primario (CTA)"}</button>
            <button className="px-4 py-2 rounded-lg bg-pine text-white text-sm font-semibold hover:bg-pine2 transition-colors">{ca ? "Secundari" : "Secundario"}</button>
            <button className="px-4 py-2 rounded-lg border border-line text-sm font-semibold hover:bg-sand transition-colors">{ca ? "Terciari" : "Terciario"}</button>
            <button className="px-4 py-2 rounded-lg text-sm font-semibold text-ember3 hover:bg-embersoft transition-colors">{ca ? "Enllaç discret" : "Enlace discreto"}</button>
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-stone mb-2">{ca ? "Insignies (badges)" : "Insignias (badges)"}</div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-mintsoft text-mossdeep border border-mintline px-2.5 py-1 text-xs font-semibold">{ca ? "Operatiu" : "Operativo"}</span>
            <span className="rounded-full bg-ambersoft text-ambertext border border-amberline px-2.5 py-1 text-xs font-semibold">{ca ? "Avís" : "Aviso"}</span>
            <span className="rounded-full bg-embersoft text-ember3 border border-emberline px-2.5 py-1 text-xs font-semibold">{ca ? "Zona tensada" : "Zona tensionada"}</span>
            <span className="rounded-full bg-sand text-stone border border-line px-2.5 py-1 text-xs font-semibold">{ca ? "Neutre" : "Neutro"}</span>
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-stone mb-2">{ca ? "Input" : "Input"}</div>
          <input
            value={demoInput}
            onChange={(e) => setDemoInput(e.target.value)}
            placeholder={ca ? "Cerca municipi (ex. Girona)" : "Busca municipio (ej. Girona)"}
            className="w-full max-w-sm rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ember/40 focus:border-ember"
          />
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-stone mb-2">Skeleton</div>
          <div className="space-y-2 max-w-sm">
            <div className="pr-skeleton h-4 w-2/3" />
            <div className="pr-skeleton h-4 w-full" />
            <div className="pr-skeleton h-4 w-5/6" />
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-stone mb-2">{ca ? "Targeta" : "Tarjeta"}</div>
          <div className="pr-lift max-w-sm rounded-2xl border border-line bg-card p-4">
            <div className="font-bold">{ca ? "Targeta elevable" : "Tarjeta elevable"}</div>
            <p className="text-sm text-stone mt-1">{ca ? "Passa el ratolí per sobre: s'aixeca 2px amb ombra suau." : "Pasa el ratón por encima: se eleva 2px con sombra suave."}</p>
          </div>
        </div>
      </div>

      <p className="mt-8 text-xs text-stone">
        {ca ? "Convencions: radi xl (rounded-2xl) per a targetes, lg per a botons i inputs; ombres només a elements flotants; icones lucide-react a 16-20px." : "Convenciones: radio xl (rounded-2xl) para tarjetas, lg para botones e inputs; sombras solo en elementos flotantes; iconos lucide-react a 16-20px."}
      </p>
    </div>
  );
}
