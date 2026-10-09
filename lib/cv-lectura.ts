// Lee el texto de un currículum en PDF y propone datos para el perfil.
// Son SUGERENCIAS con reglas simples (sin inteligencia artificial): la persona las revisa antes de guardar.
// No funciona con PDF escaneados (imágenes): esos no tienen texto que leer.
import { extractText, getDocumentProxy } from "unpdf";

export type Sugerencias = {
  descripcion: string;
  experiencia: string;
  anios: string;
  rubros: number[];
  comunas: number[];
};

type Opcion = { id: number; nombre: string };

/** Quita tildes para comparar sin importar acentos (conserva mayúsculas). */
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const clave = (s: string) => sinTildes(s).toLowerCase().replace(/[:.\s]+$/g, "").trim();

const TITULOS_PERFIL = /^(perfil( profesional| laboral)?|resumen( profesional)?|sobre mi|acerca de mi|objetivo( profesional| laboral)?|presentacion|descripcion personal)$/;
const TITULOS_EXPERIENCIA = /^(experiencia( laboral| profesional| de trabajo)?|historial laboral|trayectoria( laboral| profesional)?|antecedentes laborales)$/;
const OTROS_TITULOS = /^(educacion|formacion( academica)?|estudios|antecedentes academicos|habilidades|competencias|idiomas|certificaciones|cursos( y certificaciones)?|referencias( laborales)?|conocimientos|datos personales|informacion personal|contacto|software|herramientas|logros|intereses|aptitudes|licencias?)$/;

export async function textoDePDF(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

/** Corta un texto largo en el último salto de línea antes del máximo. */
function recortar(t: string, max: number) {
  const limpio = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.lastIndexOf("\n", max);
  return limpio.slice(0, corte > max * 0.5 ? corte : max).trim();
}

/** Separa el CV en secciones según sus títulos ("Perfil", "Experiencia laboral", "Educación", etc.). */
function secciones(texto: string) {
  const out: { perfil: string[]; experiencia: string[] } = { perfil: [], experiencia: [] };
  let actual: "perfil" | "experiencia" | null = null;
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l) { if (actual) out[actual].push(""); continue; }
    const k = clave(l);
    if (k.length <= 40) {
      if (TITULOS_PERFIL.test(k)) { actual = "perfil"; continue; }
      if (TITULOS_EXPERIENCIA.test(k)) { actual = "experiencia"; continue; }
      if (OTROS_TITULOS.test(k)) { actual = null; continue; }
    }
    if (actual) out[actual].push(l);
  }
  return { perfil: out.perfil.join("\n"), experiencia: out.experiencia.join("\n") };
}

/** Años de experiencia: primero busca "X años de experiencia"; si no, usa el rango de años de la sección de experiencia. */
function aniosExperiencia(texto: string, experiencia: string, hoy = new Date()) {
  const explicito = sinTildes(texto).match(/(\d{1,2})\+?\s*anos? de experiencia/i);
  if (explicito) return explicito[1];
  const anioActual = hoy.getFullYear();
  const actual = /(actualidad|actual|presente|a la fecha|hoy)/i;
  const anios: number[] = [];
  for (const m of sinTildes(experiencia).matchAll(/\b(19[7-9]\d|20[0-4]\d)\b/g)) anios.push(Number(m[1]));
  if (actual.test(sinTildes(experiencia))) anios.push(anioActual);
  const validos = anios.filter((a) => a <= anioActual);
  if (validos.length < 2) return "";
  const n = Math.max(...validos) - Math.min(...validos);
  return n >= 0 && n <= 60 ? String(n) : "";
}

// Palabras que indican cada rubro (se comparan sin tildes y en minúsculas).
const PALABRAS_RUBRO: Record<string, string[]> = {
  "gastronomia": ["garzon", "garzona", "mesero", "mesera", "cocina", "cocinero", "bartender", "barista", "restaurant", "copero", "banqueteria", "runner"],
  "eventos": ["evento", "promotor", "promotora", "anfitrion", "anfitriona", "montaje", "acreditacion", "produccion de eventos"],
  "comercio": ["vendedor", "vendedora", "ventas", "cajero", "cajera", "reponedor", "retail", "tienda", "supermercado", "ecommerce", "e-commerce"],
  "logistica": ["logistica", "bodega", "bodeguero", "inventario", "despacho", "picking", "operario", "distribucion", "centro de distribucion", "abastecimiento"],
  "aseo y mantenimiento": ["aseo", "limpieza", "mantenimiento", "mantencion", "auxiliar de servicio"],
  "administracion": ["administrativo", "administrativa", "administracion", "secretaria", "recepcionista", "contabilidad", "asistente administrativo", "oficina"],
  "servicios y oficios": ["electricista", "gasfiter", "carpintero", "pintor", "soldador", "mecanico", "jardinero", "maestro", "conductor", "chofer"],
};

function rubrosSugeridos(texto: string, rubros: Opcion[]) {
  const t = " " + sinTildes(texto).toLowerCase().replace(/[^a-z0-9ñ\- ]+/g, " ") + " ";
  return rubros
    .filter((r) => (PALABRAS_RUBRO[clave(r.nombre)] ?? []).some((p) => t.includes(" " + p)))
    .map((r) => r.id);
}

/** Comunas cuyo nombre aparece escrito con mayúscula en el CV (evita confundir "independencia" con la comuna). */
function comunasSugeridas(texto: string, comunas: Opcion[]) {
  const t = sinTildes(texto);
  const vistas = comunas.filter((c) => {
    const nombre = sinTildes(c.nombre).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z])${nombre}([^A-Za-z]|$)`).test(t);
  });
  return vistas.slice(0, 10).map((c) => c.id);
}

export function sugerirPerfil(texto: string, rubros: Opcion[], comunas: Opcion[]): Sugerencias {
  const s = secciones(texto);
  return {
    // El perfil suele ser un párrafo cortado en varias líneas: se une en uno.
    descripcion: recortar(s.perfil.split(/\n{2,}/).map((p) => p.replace(/\n/g, " ")).join("\n\n"), 1000),
    experiencia: recortar(s.experiencia, 2000),
    anios: aniosExperiencia(texto, s.experiencia),
    rubros: rubrosSugeridos(texto, rubros),
    comunas: comunasSugeridas(texto, comunas),
  };
}
