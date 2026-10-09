// Normas de publicación, en el formulario. La base de datos aplica las mismas reglas al publicar
// (job_content_issues en la migración 10): si cambias una, cambia la otra.

export const TIPOS_CONTRATO = [
  { id: "plazo_fijo", nombre: "Contrato a plazo fijo", ayuda: "Contrato de trabajo por días o semanas determinadas." },
  { id: "por_obra", nombre: "Contrato por obra o faena", ayuda: "Contrato de trabajo que termina al concluir la tarea o el evento." },
  { id: "indefinido", nombre: "Contrato indefinido", ayuda: "Contrato de trabajo sin fecha de término." },
  { id: "honorarios", nombre: "Boleta de honorarios", ayuda: "Servicio independiente: la persona organiza su trabajo y emite boleta." },
] as const;

export type TipoContrato = (typeof TIPOS_CONTRATO)[number]["id"];
export const nombreContrato = (id: string | null | undefined) => TIPOS_CONTRATO.find((t) => t.id === id)?.nombre ?? "Por definir";

export const NORMAS = [
  "Sin teléfonos, correos, enlaces ni WhatsApp: la comunicación ocurre dentro de TurnoExpress.",
  "Un solo puesto y una sola ubicación por publicación.",
  "Título claro con el nombre del puesto, sin mayúsculas sostenidas.",
  "Pago con monto fijo: no se aceptan pagos solo por comisión ni esquemas multinivel.",
  "Nunca se puede cobrar al trabajador (cursos, credenciales, inscripciones).",
  "Sin requisitos discriminatorios: edad, sexo, apariencia, situación familiar, religión o nacionalidad.",
];

const REGLAS: [RegExp[], string][] = [
  [[
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
    /(https?:\/\/|www\.)/i,
    /\b[a-z0-9-]+\.(cl|com|net|org|io|app|link|ly|me)\b/i,
    /(\+?56[ .-]?)?\b9[ .-]?\d{4}[ .-]?\d{4}\b/,
    /\b(whatsapp|whatsap|wsp|wasap|telegram)\b/i,
  ], "No incluyas teléfonos, correos, enlaces ni WhatsApp. Los postulantes te escriben por TurnoExpress."],
  [[
    /(debes|deber[aá]s|tienes que|hay que|se debe)\s+(pagar|cancelar|depositar|transferir|comprar)/i,
    /(costo|valor|precio|pago)\s+de\s+(la\s+)?(inscripci[oó]n|matr[ií]cula|curso|capacitaci[oó]n|credencial|kit)/i,
    /inversi[oó]n\s+inicial/i,
  ], "No se puede cobrar al trabajador por cursos, credenciales ni inscripciones."],
  [[/(multinivel|piramidal|oportunidad de negocio|network marketing|ingresos ilimitados|s[eé] tu propio jefe)/i],
    "No se aceptan esquemas multinivel ni oportunidades de negocio."],
  [[/(s[oó]lo|solamente|[uú]nicamente)\s+(por\s+)?comisi[oó]n/i, /sin sueldo (base|fijo)/i],
    "El pago debe ser un monto fijo; no se acepta pago solo por comisión."],
  [[
    /(buena presencia|sexo (masculino|femenino)|estado civil|sin hijos|no embarazada|religi[oó]n)/i,
    /s[oó]lo\s+(hombres|mujeres|varones|damas|se[nñ]oritas|chilen[oa]s)/i,
    /edad\s+(entre|m[aá]xima|m[ií]nima)/i,
    /(menor|mayor)(es)?\s+de\s+[2-9]\d\s+a[nñ]os/i,
  ], "Quita requisitos discriminatorios (edad, sexo, apariencia, situación familiar, religión o nacionalidad). Pide solo lo que exige el trabajo."],
];

/** Devuelve el primer problema de un texto, o null si cumple las normas. */
export function problemaTexto(texto: string): string | null {
  if (!texto.trim()) return null;
  for (const [res, msg] of REGLAS) if (res.some((r) => r.test(texto))) return msg;
  return null;
}

const PALABRAS_GENERICAS = /\b(se|necesita|necesito|necesitamos|busca|busco|buscamos|urgente|hoy|ya|para|de|un|una|por|favor|oferta|trabajo|empleo|pega|turno|turnos|personal|gente)\b/gu;

export function problemaTitulo(titulo: string): string | null {
  const contenido = problemaTexto(titulo);
  if (contenido) return contenido;
  const letras = titulo.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  if (letras.length >= 6 && letras === letras.toUpperCase()) return "No escribas el título en mayúsculas.";
  const util = titulo.toLowerCase().replace(PALABRAS_GENERICAS, "").replace(/[^a-záéíóúüñ ]/g, "").trim();
  if (titulo.trim() && !util) return 'El título es muy genérico. Indica el puesto, por ejemplo "Garzón para evento".';
  return null;
}
