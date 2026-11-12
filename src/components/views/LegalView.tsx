"use client";

import { useApp } from "@/components/app-context";

export default function LegalView({ kind }: { kind: "avis" | "privacitat" | "cookies" | "faq" }) {
  const { t, locale } = useApp();

  if (kind === "faq") {
    const faqs = [t.faq.q1, t.faq.q2, t.faq.q3, t.faq.q4, t.faq.q5];
    return (
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-12">
        <h1 className="text-3xl font-extrabold">{t.faq.title}</h1>
        <div className="mt-8 space-y-4">
          {faqs.map((f, i) => (
            <details key={i} className="bg-white rounded-xl border border-[#e5e1da] p-5 group">
              <summary className="font-bold cursor-pointer list-none flex justify-between items-center gap-3">
                {f.q}
                <span className="text-[#e8673c] text-xl group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-3 text-sm text-[#4b5349] leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    );
  }

  const titles = { avis: t.legal.avis, privacitat: t.legal.privacitat, cookies: t.legal.cookies };
  const ca = locale === "ca";

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold">{titles[kind]}</h1>

      <div className="mt-4 rounded-xl bg-[#fff7e8] border border-[#f2d9a4] text-[#8a6116] text-sm p-4">
        {t.legal.completar}
      </div>

      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-[#333]">
        {kind === "avis" && (
          <>
            <Block title={ca ? "1. Titular" : "1. Titularidad"}>
              <Placeholder ca={ca} what={ca ? "raó social, NIF, domicili social, correu de contacte i telèfon de l'entitat titular de la web" : "razón social, NIF, domicilio social, correo de contacto y teléfono de la entidad titular de la web"} />
              <p className="mt-2 text-xs text-[#6b6f68]">
                {ca
                  ? "Dades identificatives exigides per l'article 10 de la LSSI-CE (Llei 34/2002, de societats de la informació i de comerç electrònic). Es completaran quan el propietari les proporcioni; no s'inventen mai."
                  : "Datos identificativos exigidos por el artículo 10 de la LSSI-CE (Ley 34/2002). Se completarán cuando el propietario los proporcione; nunca se inventan."}
              </p>
            </Block>
            <Block title={ca ? "2. Objecte" : "2. Objeto"}>
              <p>
                {ca
                  ? "Preureal és una eina informativa que consulta i visualitza estadístiques oficials agregades sobre el mercat de lloguer a Catalunya: preu mitjà mensual per municipi (explotació estadística de les fiances de lloguer de l'Incasòl, publicada per la Generalitat), declaració d'àrees de mercat residencial tensat, cartografia d'edificis de l'ICGC i referències cadastrals."
                  : "Preureal es una herramienta informativa que consulta y visualiza estadísticas oficiales agregadas sobre el mercado de alquiler en Cataluña: precio medio mensual por municipio (explotación estadística de las fianzas de alquiler del Incasòl, publicada por la Generalitat), declaración de áreas de mercado residencial tensionado, cartografía de edificios del ICGC y referencias catastrales."}
              </p>
              <p className="mt-2">
                {ca
                  ? "La informació mostrada té caràcter estadístic i agregat. No constitueix una taxació d'un habitatge concret ni assessorament juridic o immobiliari. Les dades oficials es publiquen amb retard i poden tenir limitacions metodològiques que es descriuen a les fonts."
                  : "La información mostrada tiene carácter estadístico y agregado. No constituye una tasación de una vivienda concreta ni asesoramiento jurídico o inmobiliario. Los datos oficiales se publican con retraso y pueden tener limitaciones metodológicas que se describen en las fuentes."}
              </p>
            </Block>
            <Block title={ca ? "3. Fonts de dades i atribució" : "3. Fuentes de datos y atribución"}>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>{ca ? "Fiances de lloguer (Incasòl) via habitatge.gencat.cat — © Generalitat de Catalunya" : "Fianzas de alquiler (Incasòl) vía habitatge.gencat.cat — © Generalitat de Catalunya"}</li>
                <li>{ca ? "Cartografia: Institut Cartogràfic i Geològic de Catalunya (ICGC), llicència CC-BY 4.0" : "Cartografía: Instituto Cartográfico y Geológico de Cataluña (ICGC), licencia CC-BY 4.0"}</li>
                <li>{ca ? "Base cartogràfica © OpenStreetMap contributors i © CARTO" : "Base cartográfica © OpenStreetMap contributors y © CARTO"}</li>
                <li>{ca ? "Referències cadastrals: serveis lliures de la Direcció General del Catastro" : "Referencias catastrales: servicios libres de la Dirección General del Catastro"}</li>
                <li>{ca ? "Àrees tensades: Resolucions TER/3739/2026 i TER/3740/2026, DOGC 19-10-2026" : "Áreas tensionadas: Resoluciones TER/3739/2026 y TER/3740/2026, DOGC 19-10-2026"}</li>
              </ul>
            </Block>
            <Block title={ca ? "4. Propietat intel·lectual" : "4. Propiedad intelectual"}>
              <p>
                {ca
                  ? "El disseny, codi i continguts propis de la plataforma són propietat del titular. Les dades públiques utilitzades ho són conforme a les llicències de les seves fonts, que se citen a tots els productes derivats. Qualsevol ús comercial massiu de dades de terceres fonts requereix els convenis oportuns."
                  : "El diseño, código y contenidos propios de la plataforma son propiedad del titular. Los datos públicos utilizados lo son conforme a las licencias de sus fuentes, que se citan en todos los productos derivados. Cualquier uso comercial masivo de datos de terceras fuentes requiere los convenios oportunos."}
              </p>
            </Block>
            <Block title={ca ? "5. Responsabilitat" : "5. Responsabilidad"}>
              <p>
                {ca
                  ? "L'entitat no garanteix la disponibilitat contínua dels serveis de tercers (ICGC, Cadastre) ni l'actualització immediata de les dades oficials. No es responsabilitza de decisions preses pels usuaris basades en la informació estadística mostrada."
                  : "La entidad no garantiza la disponibilidad continua de los servicios de terceros (ICGC, Catastro) ni la actualización inmediata de los datos oficiales. No se responsabiliza de decisiones tomadas por los usuarios basadas en la información estadística mostrada."}
              </p>
            </Block>
          </>
        )}

        {kind === "privacitat" && (
          <>
            <Block title={ca ? "1. Responsable del tractament" : "1. Responsable del tratamiento"}>
              <Placeholder ca={ca} what={ca ? "dades del responsable (entitat, NIF, adreça, correu de privacitat)" : "datos del responsable (entidad, NIF, dirección, correo de privacidad)"} />
            </Block>
            <Block title={ca ? "2. Dades que tractem" : "2. Datos que tratamos"}>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>{ca ? "Compte d'usuari: correu electrònic, nom (opcional), contrasenya xifrada (hash), idioma i pla." : "Cuenta de usuario: correo electrónico, nombre (opcional), contraseña cifrada (hash), idioma y plan."}</li>
                <li>{ca ? "Registres d'ús: consultes realitzades al mapa i esdeveniments d'analítica agregats (sense contingut personal)." : "Registros de uso: consultas realizadas en el mapa y eventos de analítica agregados (sin contenido personal)."}</li>
                <li>{ca ? "Pagaments: els processa Stripe com a encarregat; no emmagatzemem mai dades de targeta als nostres servidors." : "Pagos: los procesa Stripe como encargado; nunca almacenamos datos de tarjeta en nuestros servidores."}</li>
              </ul>
            </Block>
            <Block title={ca ? "3. Finalitat i base jurídica" : "3. Finalidad y base jurídica"}>
              <p>
                {ca
                  ? "Gestió del compte i del servei contractat (execució de contracte, art. 6.1.b RGPD), seguretat del servei i analítica pròpia agregada (interès legítim, art. 6.1.f), i enviament de correus transaccionals (benvinguda, rebut). No s'envien comunicacions comercials sense consentiment."
                  : "Gestión de la cuenta y del servicio contratado (ejecución de contrato, art. 6.1.b RGPD), seguridad del servicio y analítica propia agregada (interés legítimo, art. 6.1.f), y envío de correos transaccionales (bienvenida, recibo). No se envían comunicaciones comerciales sin consentimiento."}
              </p>
            </Block>
            <Block title={ca ? "4. Conservació i drets" : "4. Conservación y derechos"}>
              <p>
                {ca
                  ? "Es conserven mentre hi hagi compte actiu. Els registres d'ús pseudonimitzats (hash d'IP) es conserven màxim 24 mesos amb fins estadístics i de seguretat. Els logs de correus transaccionals, 12 mesos."
                  : "Se conservan mientras exista cuenta activa. Los registros de uso seudonimizados (hash de IP) se conservan máximo 24 meses con fines estadísticos y de seguridad. Los logs de correos transaccionales, 12 meses."}
              </p>
              <p className="mt-2">
                {ca
                  ? "Drets (art. 15-22 RGPD): accés, rectificació, supressió, oposició, limitació, portabilitat i no ser objecte de decisions automatitzades. Pots exercir-los tu mateix: exportació de dades i eliminació del compte al teu panell d'usuari (Panell → Dades personals / Seguretat), o escrivint al correu de privacitat del responsable. També pots reclamar a l'Agència Espanyola de Protecció de Dades (www.aepd.es)."
                  : "Derechos (art. 15-22 RGPD): acceso, rectificación, supresión, oposición, limitación, portabilidad y a no ser objeto de decisiones automatizadas. Puedes ejercerlos tú mismo: exportación de datos y eliminación de la cuenta en tu panel de usuario (Panel → Datos personales / Seguridad), o escribiendo al correo de privacidad del responsable. También puedes reclamar en la Agencia Española de Protección de Datos (www.aepd.es)."}
              </p>
            </Block>
          </>
        )}

        {kind === "cookies" && (
          <>
            <Block title={ca ? "Cookies que utilitzem" : "Cookies que utilizamos"}>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><b>pr_session</b> — {ca ? "cookie tècnica de sessió (httpOnly), imprescindible per iniciar la sessió. No requereix consentiment." : "cookie técnica de sesión (httpOnly), imprescindible para iniciar sesión. No requiere consentimiento."}</li>
                <li>{ca ? "Preferències (localStorage): idioma escollit i la pròpia decisió de consentiment. No són cookies ni requereixen consentiment." : "Preferencias (localStorage): idioma elegido y la propia decisión de consentimiento. No son cookies ni requieren consentimiento."}</li>
              </ul>
              <p className="mt-2">
                {ca
                  ? "En la primera visita es mostra un banner de consentiment. Com que no carreguem cap tecnologia no essencial, el servei funciona completament tant si acceptes com si rebutges."
                  : "En la primera visita se muestra un banner de consentimiento. Como no cargamos ninguna tecnología no esencial, el servicio funciona completamente tanto si aceptas como si rechazas."}
              </p>
            </Block>
            <Block title={ca ? "Analítica" : "Analítica"}>
              <p>
                {ca
                  ? "Actualment no s'instal·len cookies d'analítica de tercers. L'analítica de conversió és pròpia i agregada (registres, consultes, subscripcions). Si en el futur s'instal·la analítica de tercers (p. ex. Google Analytics 4), es mostrarà un banner de consentiment abans de carregar-la."
                  : "Actualmente no se instalan cookies de analítica de terceros. La analítica de conversión es propia y agregada (registros, consultas, suscripciones). Si en el futuro se instala analítica de terceros (p. ej. Google Analytics 4), se mostrará un banner de consentimiento antes de cargarla."}
              </p>
            </Block>
          </>
        )}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-bold text-lg">{title}</h2>
      <div className="mt-2 text-sm text-[#4b5349] leading-relaxed">{children}</div>
    </section>
  );
}

function Placeholder({ ca, what }: { ca: boolean; what: string }) {
  return (
    <p className="rounded-lg border border-dashed border-[#e8673c] bg-[#fdeae2]/50 px-3 py-2 text-[#b0431c]">
      【{ca ? "COMPLETAR" : "COMPLETAR"}】 {ca ? "Falta" : "Falta"}: {what}.
    </p>
  );
}
