// Lee el texto de un currículum en PDF y propone los datos del CV estructurado.
// Son SUGERENCIAS con reglas simples (sin inteligencia artificial): la persona las revisa y corrige.
// No funciona con PDF escaneados (imágenes): esos no tienen texto que leer.
import { extractText, getDocumentProxy } from "unpdf";

export type ExperienciaCV = {
  cargo: string; empresa: string; funciones: string; lugar: string;
  inicio: string; termino: string; actual: boolean; // fechas "AAAA-MM" o ""
};
export type FormacionCV = {
  institucion: string; titulo: string; nivel: NivelFormacion;
  inicio: string; termino: string; actual: boolean;
};
export type IdiomaCV = { idioma: string; nivel: NivelIdioma };
export type NivelFormacion = "basica" | "media" | "tecnica" | "universitaria" | "postgrado" | "curso" | "otro";
export type NivelIdioma = "basico" | "intermedio" | "avanzado" | "nativo";

export type Sugerencias = {
  titular: string;
  descripcion: string;
  anios: string;
  experiencias: ExperienciaCV[];
  formacion: FormacionCV[];
  idiomas: IdiomaCV[];
  habilidades: string[];
  movilidad: { viajar: boolean; residencia: boolean; vehiculo: boolean };
  rubros: number[];
  comunas: number[];
};

type Opcion = { id: number; nombre: string };

/** Quita tildes conservando el largo del texto (el texto se normaliza a NFC antes). */
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const clave = (s: string) => sinTildes(s).toLowerCase().replace(/[:.\s]+$/g, "").trim();

type Seccion = "perfil" | "experiencia" | "educacion" | "idiomas" | "habilidades" | "otra";
const TITULOS: [Seccion, RegExp][] = [
  ["perfil", /^(perfil( profesional| laboral)?|resumen( profesional)?|sobre mi|acerca de mi|objetivo( profesional| laboral)?|presentacion|descripcion( personal)?)$/],
  ["experiencia", /^(experiencia( laboral| profesional| de trabajo)?|historial laboral|trayectoria( laboral| profesional)?|antecedentes laborales)$/],
  ["educacion", /^(educacion|formacion( academica)?|estudios|antecedentes academicos|cursos( y certificaciones)?|certificaciones)$/],
  ["idiomas", /^idiomas?$/],
  ["habilidades", /^(habilidades( y competencias)?|competencias( y habilidades)?|conocimientos( tecnicos| informaticos)?|software|herramientas|aptitudes|habilidades tecnicas)$/],
  ["otra", /^(referencias( laborales)?|datos personales|informacion personal|contacto|logros|intereses|licencias?|otros|informacion adicional)$/],
];

export async function textoDePDF(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).normalize("NFC");
}

function separarSecciones(texto: string) {
  const out: Record<Seccion, string[]> = { perfil: [], experiencia: [], educacion: [], idiomas: [], habilidades: [], otra: [] };
  let actual: Seccion | null = null;
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.replace(/\s+/g, " ").trim();
    if (!l) continue;
    const k = clave(l);
    const titulo = k.length <= 40 ? TITULOS.find(([, re]) => re.test(k)) : undefined;
    if (titulo) { actual = titulo[0]; continue; }
    if (actual) out[actual].push(l);
  }
  return out;
}

// ---------------------------------------------------------------- Fechas
const MESES: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6,
  jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, set: 9, setiembre: 9,
  oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
};
const MES = "(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sept?(?:iembre)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)";
const FECHA = `(?:(\\d{1,2})[\\/.-](\\d{4})|${MES}\\.?\\s*(?:de\\s+|del\\s+)?(\\d{4})|((?:19|20)\\d{2}))`;
const ACTUAL = "(actualidad|actual|presente|a la fecha|hoy)";
const RE_RANGO = new RegExp(`(?:desde\\s+)?${FECHA}\\s*(?:-|–|—|a|al|hasta)\\s*(?:${FECHA}|${ACTUAL})`, "i");
const RE_DESDE = new RegExp(`desde\\s+${FECHA}`, "i");
const RE_FECHA = new RegExp(FECHA, "i");

function aMes(g: (string | undefined)[], i: number): string {
  // g[i..i+4]: mm, yyyy | mes, yyyy | yyyy
  const [mm, y1, mes, y2, y3] = g.slice(i, i + 5);
  const anio = Number(y1 ?? y2 ?? y3);
  if (!anio || anio < 1950 || anio > new Date().getFullYear() + 1) return "";
  let m = 1;
  if (mm) m = Math.min(12, Math.max(1, Number(mm)));
  else if (mes) m = MESES[mes.toLowerCase().replace(/\.$/, "")] ?? MESES[mes.toLowerCase().slice(0, 3)] ?? 1;
  return `${anio}-${String(m).padStart(2, "0")}`;
}

/** Busca un rango de fechas en una línea. Devuelve inicio, término, si es actual y la línea sin las fechas. */
function rangoEn(linea: string) {
  const t = sinTildes(linea);
  const r = t.match(RE_RANGO);
  if (r && r.index !== undefined) {
    const inicio = aMes([...r], 1);
    const actual = !!r[11];
    const termino = actual ? "" : aMes([...r], 6);
    if (inicio) return { inicio, termino, actual, resto: limpiarResto(linea.slice(0, r.index) + " " + linea.slice(r.index + r[0].length)) };
  }
  const d = t.match(RE_DESDE);
  if (d && d.index !== undefined) {
    const inicio = aMes([...d], 1);
    if (inicio) return { inicio, termino: "", actual: true, resto: limpiarResto(linea.slice(0, d.index) + " " + linea.slice(d.index + d[0].length)) };
  }
  return null;
}

function fechaSuelta(linea: string) {
  const t = sinTildes(linea);
  const f = t.match(RE_FECHA);
  if (!f || f.index === undefined) return null;
  const mes = aMes([...f], 1);
  return mes ? { mes, resto: limpiarResto(linea.slice(0, f.index) + " " + linea.slice(f.index + f[0].length)) } : null;
}

const limpiarResto = (s: string) =>
  s.replace(/[()[\]]/g, " ").replace(/\s+/g, " ").replace(/^[\s,|•·\-–—:]+|[\s,|•·\-–—:]+$/g, "").trim();
const esViñeta = (l: string) => /^[•·▪●◦\-*–]\s*/.test(l);
const sinViñeta = (l: string) => l.replace(/^[•·▪●◦\-*–]\s*/, "").trim();
const corto = (l: string) => l.length <= 70 && !/[.;]$/.test(l) && !esViñeta(l);

const MARCAS_EMPRESA = /\b(spa|ltda|limitada|s\.?a\.?|eirl|e\.i\.r\.l|inc|corp|empresa|comercial|distribuidora|sociedad|holding|group|grupo)\b/i;

function separarCargoEmpresa(textos: string[]) {
  let partes = textos.filter(Boolean);
  if (partes.length === 1) {
    const p = partes[0].split(/\s+(?:-|–|—|\||en|@)\s+|,\s+/);
    partes = p.length > 1 ? [p[0], p.slice(1).join(" ")] : p;
  }
  let [cargo = "", empresa = ""] = partes;
  if (MARCAS_EMPRESA.test(cargo) && !MARCAS_EMPRESA.test(empresa)) [cargo, empresa] = [empresa, cargo];
  return { cargo: cargo.slice(0, 100), empresa: empresa.slice(0, 120) };
}

// ---------------------------------------------------------------- Experiencia
function experiencias(lineas: string[]): ExperienciaCV[] {
  const anclas: { i: number; r: NonNullable<ReturnType<typeof rangoEn>> }[] = [];
  lineas.forEach((l, i) => { const r = rangoEn(l); if (r) anclas.push({ i, r }); });

  // Encabezado de cada experiencia: hasta 2 líneas cortas justo antes de la línea con fechas.
  const inicios = anclas.map(({ i }, k) => {
    const limite = k === 0 ? -1 : anclas[k - 1].i;
    let j = i;
    while (j - 1 > limite && i - (j - 1) <= 2 && corto(lineas[j - 1])) j--;
    return j;
  });

  return anclas.slice(0, 20).map(({ i, r }, k) => {
    const encabezado = [...lineas.slice(inicios[k], i), r.resto];
    const { cargo, empresa } = separarCargoEmpresa(encabezado);
    const fin = k + 1 < anclas.length ? inicios[k + 1] : lineas.length;
    const funciones = lineas.slice(i + 1, fin).map(sinViñeta).join(" ").replace(/\s+/g, " ").trim();
    return {
      cargo: cargo || "Cargo sin indicar",
      empresa: empresa || "Empresa sin indicar",
      funciones: funciones.length > 500 ? funciones.slice(0, 497).replace(/\s+\S*$/, "") + "..." : funciones,
      lugar: "",
      inicio: r.inicio,
      termino: r.actual ? "" : r.termino,
      actual: r.actual,
    };
  });
}

// ---------------------------------------------------------------- Formación
const RE_INSTITUCION = /\b(universidad|instituto|liceo|colegio|cft|centro de formacion|duoc|inacap|aiep|escuela|academia|otec|santo tomas|ip\b|complejo educacional)/i;

function nivelDe(texto: string): NivelFormacion {
  const t = sinTildes(texto).toLowerCase();
  if (/magister|master|diplomado|doctorado|postitulo|postgrado/.test(t)) return "postgrado";
  if (/tecnico|tecnica|cft|instituto profesional|duoc|inacap|aiep/.test(t)) return "tecnica";
  if (/ingenier|licenciad|universidad|pedagogia|contador auditor|psicolog|abogad/.test(t)) return "universitaria";
  if (/curso|certificacion|capacitacion|otec|diplomado/.test(t)) return "curso";
  if (/ensenanza media|liceo|cuarto medio|4.? medio|colegio|educacion media/.test(t)) return "media";
  if (/ensenanza basica|educacion basica/.test(t)) return "basica";
  return "otro";
}

function formacion(lineas: string[]): FormacionCV[] {
  const out: FormacionCV[] = [];
  const usadas = new Set<number>();
  lineas.forEach((l, i) => {
    if (usadas.has(i) || out.length >= 10) return;
    const base = sinTildes(l);
    if (!RE_INSTITUCION.test(base)) return;
    usadas.add(i);
    let texto = l, inicio = "", termino = "", actual = false;
    const r = rangoEn(texto);
    if (r) { ({ inicio, termino, actual } = r); texto = r.resto; }
    else { const f = fechaSuelta(texto); if (f) { termino = f.mes; texto = f.resto; } }

    // La institución y el título pueden venir en la misma línea ("Técnico en Logística, Universidad Mayor").
    let institucion = texto, titulo = "";
    const partes = texto.split(/\s+(?:-|–|—|\|)\s+|,\s+/);
    if (partes.length > 1) {
      const idx = partes.findIndex((p) => RE_INSTITUCION.test(sinTildes(p)));
      institucion = partes[idx >= 0 ? idx : 0];
      titulo = partes.filter((_, k) => k !== (idx >= 0 ? idx : 0)).join(", ");
    }
    // Si no, el título suele estar en la línea anterior o siguiente.
    for (const j of [i - 1, i + 1]) {
      if (titulo || j < 0 || j >= lineas.length || usadas.has(j)) continue;
      const otra = lineas[j];
      if (RE_INSTITUCION.test(sinTildes(otra)) || !corto(otra)) continue;
      const rr = rangoEn(otra), ff = rr ? null : fechaSuelta(otra);
      const resto = rr ? rr.resto : ff ? ff.resto : otra;
      if (rr && !inicio) ({ inicio, termino, actual } = rr);
      if (ff && !termino && !inicio) termino = ff.mes;
      if (resto) titulo = resto;
      usadas.add(j);
    }
    if (!inicio && !termino) {
      for (const j of [i + 1, i - 1]) {
        if (j < 0 || j >= lineas.length) continue;
        const rr = rangoEn(lineas[j]);
        if (rr && !rr.resto) { ({ inicio, termino, actual } = rr); usadas.add(j); break; }
      }
    }
    out.push({
      institucion: institucion.slice(0, 150) || "Institución sin indicar",
      titulo: titulo.slice(0, 150),
      nivel: nivelDe(`${titulo} ${institucion}`),
      inicio, termino: actual ? "" : termino, actual,
    });
  });
  return out;
}

// ---------------------------------------------------------------- Idiomas
const IDIOMAS: [RegExp, string][] = [
  [/\bespanol\b|\bcastellano\b/, "Español"], [/\bingles\b|\benglish\b/, "Inglés"], [/\bportugues\b/, "Portugués"],
  [/\bfrances\b/, "Francés"], [/\baleman\b/, "Alemán"], [/\bitaliano\b/, "Italiano"], [/\bchino\b|\bmandarin\b/, "Chino mandarín"],
  [/\bjapones\b/, "Japonés"], [/\bcoreano\b/, "Coreano"], [/\bruso\b/, "Ruso"], [/\barabe\b/, "Árabe"],
  [/\bcreole\b|\bcriollo haitiano\b|\bkreyol\b/, "Creole haitiano"], [/\bmapudungun\b/, "Mapudungún"],
  [/lengua de senas|\blsch\b/, "Lengua de señas chilena"],
];
function nivelIdioma(t: string): NivelIdioma | null {
  if (/nativo|materno|materna/.test(t)) return "nativo";
  if (/avanzado|fluido|bilingue|\bc1\b|\bc2\b|alto/.test(t)) return "avanzado";
  if (/intermedio|\bb1\b|\bb2\b|medio/.test(t)) return "intermedio";
  if (/basico|elemental|\ba1\b|\ba2\b|bajo/.test(t)) return "basico";
  return null;
}
function idiomas(seccion: string[], todo: string[]): IdiomaCV[] {
  const vistos = new Map<string, NivelIdioma>();
  const revisar = (lineas: string[], exigirNivel: boolean) => {
    for (const l of lineas) {
      const t = sinTildes(l).toLowerCase();
      for (const [re, nombre] of IDIOMAS) {
        if (!re.test(t) || vistos.has(nombre)) continue;
        const nivel = nivelIdioma(t);
        if (nivel) vistos.set(nombre, nivel);
        else if (!exigirNivel) vistos.set(nombre, nombre === "Español" ? "nativo" : "basico");
      }
    }
  };
  revisar(seccion, false);
  if (!vistos.size) revisar(todo, true); // fuera de la sección solo si la línea dice el nivel
  return [...vistos].slice(0, 10).map(([idioma, nivel]) => ({ idioma, nivel }));
}

// ---------------------------------------------------------------- Habilidades
function habilidades(lineas: string[]): string[] {
  const vistas = new Map<string, string>();
  for (const l of lineas) {
    // Las oraciones (con punto seguido) no son listas de habilidades.
    if (/[.!?]\s+\S/.test(l) || /^(disponibilidad|no tengo|tengo|cuento con)/i.test(sinTildes(l))) continue;
    for (const parte of sinViñeta(l).split(/[,;•·|\/]|\s+-\s+|\s+y\s+/)) {
      const h = parte.replace(/[.:]+$/, "").trim();
      if (h.length < 2 || h.length > 40 || h.split(/\s+/).length > 5) continue;
      const k = sinTildes(h).toLowerCase();
      if (!vistas.has(k)) vistas.set(k, h.charAt(0).toUpperCase() + h.slice(1));
    }
  }
  return [...vistas.values()].slice(0, 30);
}

// ---------------------------------------------------------------- Otros
function movilidad(texto: string) {
  const t = sinTildes(texto).toLowerCase();
  return {
    viajar: /disponibilidad (para|de) viajar|disponible para viajar/.test(t),
    residencia: /(cambio|cambiar|cambiarme) de (residencia|ciudad)|disponibilidad para trasladarme|disponibilidad de traslado/.test(t),
    vehiculo: /(vehiculo|auto) propio/.test(t) && !/(no tengo|sin) (vehiculo|auto)/.test(t),
  };
}

const PALABRAS_RUBRO: Record<string, string[]> = {
  "gastronomia": ["garzon", "garzona", "mesero", "mesera", "cocina", "cocinero", "bartender", "barista", "restaurant", "copero", "banqueteria", "runner"],
  "eventos": ["evento", "promotor", "promotora", "anfitrion", "anfitriona", "montaje", "acreditacion", "produccion de eventos"],
  "comercio": ["vendedor", "vendedora", "ventas", "cajero", "cajera", "reponedor", "retail", "tienda", "supermercado", "ecommerce", "e-commerce"],
  "logistica": ["logistica", "bodega", "bodeguero", "inventario", "despacho", "picking", "operario", "distribucion", "centro de distribucion", "abastecimiento", "almacen"],
  "aseo y mantenimiento": ["aseo", "limpieza", "mantenimiento", "mantencion", "auxiliar de servicio"],
  "administracion": ["administrativo", "administrativa", "administracion", "secretaria", "recepcionista", "contabilidad", "asistente administrativo", "oficina"],
  "servicios y oficios": ["electricista", "gasfiter", "carpintero", "pintor", "soldador", "mecanico", "jardinero", "maestro", "conductor", "chofer"],
};
function rubrosSugeridos(texto: string, rubros: Opcion[]) {
  const t = " " + sinTildes(texto).toLowerCase().replace(/[^a-z0-9ñ\- ]+/g, " ") + " ";
  return rubros.filter((r) => (PALABRAS_RUBRO[clave(r.nombre)] ?? []).some((p) => t.includes(" " + p))).map((r) => r.id);
}

/** Comunas cuyo nombre aparece escrito con mayúscula en el CV (evita confundir "independencia" con la comuna). */
function comunasSugeridas(texto: string, comunas: Opcion[]) {
  const t = sinTildes(texto);
  return comunas
    .filter((c) => new RegExp(`(^|[^A-Za-z])${sinTildes(c.nombre).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z]|$)`).test(t))
    .slice(0, 10).map((c) => c.id);
}

function anios(texto: string, exps: ExperienciaCV[], hoy = new Date()) {
  const explicito = sinTildes(texto).match(/(\d{1,2})\+?\s*anos? de experiencia/i);
  if (explicito) return explicito[1];
  if (!exps.length) return "";
  const actual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const ini = exps.map((e) => e.inicio).sort()[0];
  const fin = exps.map((e) => (e.actual || !e.termino ? actual : e.termino)).sort().at(-1)!;
  const meses = (Number(fin.slice(0, 4)) - Number(ini.slice(0, 4))) * 12 + Number(fin.slice(5)) - Number(ini.slice(5));
  return meses >= 0 && meses <= 720 ? String(Math.floor(meses / 12)) : "";
}

export function sugerirCV(texto: string, rubros: Opcion[], comunas: Opcion[]): Sugerencias {
  const s = separarSecciones(texto);
  const todas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const exps = experiencias(s.experiencia);
  const recientes = [...exps].sort((a, b) => Number(b.actual) - Number(a.actual) || b.inicio.localeCompare(a.inicio));
  const descripcion = s.perfil.join(" ").replace(/\s+/g, " ").trim();
  return {
    titular: recientes[0]?.cargo && !recientes[0].cargo.includes("sin indicar") ? recientes[0].cargo.slice(0, 80) : "",
    descripcion: descripcion.length > 1000 ? descripcion.slice(0, 997).replace(/\s+\S*$/, "") + "..." : descripcion,
    anios: anios(texto, exps),
    experiencias: exps,
    formacion: formacion(s.educacion),
    idiomas: idiomas(s.idiomas, todas),
    habilidades: habilidades(s.habilidades),
    movilidad: movilidad(texto),
    rubros: rubrosSugeridos(texto, rubros),
    comunas: comunasSugeridas(texto, comunas),
  };
}
