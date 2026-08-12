// YvexPOS — Giro del negocio.
//
// El giro (abarrotes, ropa, cafetería…) personaliza el onboarding:
//   - la pregunta "¿Qué vende tu negocio?" (paso "giro")
//   - departamentos SUGERIDOS, con su icono — el dueño los revisa, edita o
//     descarta ANTES de que se creen (paso "departamentos"). Nunca se crean
//     en automático sin que el dueño los haya visto: mejor que decida antes
//     a que tenga que ir uno por uno borrando lo que no le sirvió.
//   - "sugerencias": rasgos de YvexPOS redactados como recomendación
//     personal, para el paso de cierre antes de entrar al POS
//   - la misión 4 de "Tu arranque" en Inicio (ver util/misiones.js)
//
// Puerto 1:1 de src/base/giro.ts del móvil — mismos ids, mismos textos.
// El icono de cada departamento usa los ids de util/iconos-depto.js; "caja"
// (general) es el respaldo para giros sin un icono temático exacto en el
// set actual (ferretería, electrónica, belleza, mascotas, ropa) — mejor
// honesto con un icono neutro que forzar uno que no encaja.

export const GIROS = [
  {
    id: "abarrotes",
    nombre: "Abarrotes y tienda",
    icono: "tienda",
    frase: "La tiendita de la esquina, la miscelánea, el mini súper.",
    mision4: "codigos",
    departamentos: [
      { nombre: "Cerveza", icono: "cerveza" },
      { nombre: "Refrescos", icono: "refresco" },
      { nombre: "Botanas", icono: "botana" },
      { nombre: "Dulces", icono: "dulce" },
      { nombre: "Lácteos", icono: "lacteo" },
      { nombre: "Panadería y tortillas", icono: "pan" },
      { nombre: "Limpieza", icono: "limpieza" },
      { nombre: "Cigarros", icono: "cigarro" },
    ],
    sugerencias: [
      "El escáner de tickets con IA aprende rápido con productos de cervecería y refrescos: fotografía el ticket de tu proveedor y el resurtido cae solo.",
      "Los departamentos te dejan ver qué línea deja más: cerveza, botanas o limpieza.",
      "Con el corte de turno sabes exactamente cuánto efectivo debe haber en el cajón al cerrar.",
    ],
  },
  {
    id: "ropa",
    nombre: "Ropa y calzado",
    icono: "ropa",
    frase: "Boutique, tenis, ropa de niños, puesto de moda.",
    mision4: "codigos",
    departamentos: [
      { nombre: "Dama", icono: "caja" },
      { nombre: "Caballero", icono: "caja" },
      { nombre: "Niños", icono: "caja" },
      { nombre: "Calzado", icono: "caja" },
      { nombre: "Accesorios", icono: "caja" },
    ],
    sugerencias: [
      "Una tienda en línea le queda como anillo al dedo a tu giro.",
      "La foto de cada producto hace que tu catálogo se vea tan bien como tu mercancía.",
      "Los reportes por departamento te dicen si vendes más dama, caballero o calzado.",
    ],
  },
  {
    id: "cafeteria",
    nombre: "Cafetería",
    icono: "taza",
    frase: "Café de olla, latte, pan dulce y buena plática.",
    mision4: "kit",
    departamentos: [
      { nombre: "Cafés", icono: "cafe" },
      { nombre: "Tés e infusiones", icono: "cafe" },
      { nombre: "Bebidas frías", icono: "refresco" },
      { nombre: "Panadería", icono: "pan" },
      { nombre: "Postres", icono: "dulce" },
    ],
    sugerencias: [
      "El ticket promedio del día te dice si van por el puro café o se animan con el pan.",
      "Los productos más vendidos se aprenden solos y aparecen primero al cobrar.",
      "Vende con o sin internet: si se va la señal a media mañana, la caja no se detiene.",
      "Calcula el costo real de cada pieza que horneas —desde el azúcar hasta el queso crema— y sabrás en cuánto conviene venderla, con Recetas.",
    ],
  },
  {
    id: "restaurante",
    nombre: "Restaurante y comida",
    icono: "cubiertos",
    frase: "Cocina económica, mariscos, tacos, fondita.",
    mision4: "kit",
    departamentos: [
      { nombre: "Entradas", icono: "caja" },
      { nombre: "Platos fuertes", icono: "carne" },
      { nombre: "Bebidas", icono: "refresco" },
      { nombre: "Postres", icono: "dulce" },
    ],
    sugerencias: [
      "El corte de turno cuadra perfecto con el servicio de comida y el de cena.",
      "Separar bebidas de platos fuertes en departamentos te muestra tu margen real.",
      "Vende con o sin internet: si se va la señal a media comida, la caja no se detiene.",
      "Con Recetas armas el costo real de cada platillo, ingrediente por ingrediente, y sabes qué margen te deja de verdad.",
    ],
  },
  {
    id: "farmacia",
    nombre: "Farmacia",
    icono: "capsula",
    frase: "Medicamentos, cuidado personal y lo que urge.",
    mision4: "codigos",
    departamentos: [
      { nombre: "Medicamentos", icono: "farmacia" },
      { nombre: "Cuidado personal", icono: "caja" },
      { nombre: "Higiene", icono: "limpieza" },
      { nombre: "Bebés", icono: "caja" },
      { nombre: "Vitaminas y suplementos", icono: "farmacia" },
    ],
    sugerencias: [
      "El stock mínimo te avisa antes de que se acabe lo que la gente busca seguido.",
      "El escáner de tickets con IA lee los tickets de tu distribuidor y actualiza costos y existencias.",
      "Con tantos productos chicos, el buscador por nombre o código te salva en cada venta.",
    ],
  },
  {
    id: "ferreteria",
    nombre: "Ferretería y tlapalería",
    icono: "llave",
    frase: "Tornillos, pintura, herramienta y soluciones.",
    mision4: "codigos",
    departamentos: [
      { nombre: "Herramientas", icono: "caja" },
      { nombre: "Pintura", icono: "caja" },
      { nombre: "Electricidad", icono: "caja" },
      { nombre: "Plomería", icono: "caja" },
      { nombre: "Tornillería", icono: "caja" },
    ],
    sugerencias: [
      "El escáner de tickets con IA aguanta catálogos enormes: entre más lo usas, mejor empareja tus productos.",
      "Las unidades por pieza, metro, litro o caja se ajustan a cómo vendes de verdad.",
      "El conteo físico te ayuda a cuadrar la tornillería sin cerrar el negocio un día entero.",
    ],
  },
  {
    id: "electronica",
    nombre: "Electrónica y cómputo",
    icono: "chip",
    frase: "Celulares, accesorios, cables y reparaciones.",
    mision4: "codigos",
    departamentos: [
      { nombre: "Celulares y accesorios", icono: "caja" },
      { nombre: "Cómputo", icono: "caja" },
      { nombre: "Audio y video", icono: "caja" },
      { nombre: "Cables y cargadores", icono: "caja" },
    ],
    sugerencias: [
      "Costo y precio por producto te muestran el margen real de cada accesorio.",
      "Los reportes por departamento separan lo que se vende seguido (cables) de lo que deja más (equipos).",
      "Tu inventario queda respaldado en la nube: tranquilo si cambias de equipo.",
    ],
  },
  {
    id: "belleza",
    nombre: "Belleza y estética",
    icono: "brillo",
    frase: "Salón, barbería, cosméticos y cuidado personal.",
    mision4: "codigos",
    departamentos: [
      { nombre: "Cabello", icono: "caja" },
      { nombre: "Maquillaje", icono: "caja" },
      { nombre: "Cuidado de la piel", icono: "caja" },
      { nombre: "Uñas", icono: "caja" },
      { nombre: "Fragancias", icono: "caja" },
    ],
    sugerencias: [
      "La foto de cada producto hace que vender cosméticos sea tan bonito como usarlos.",
      "El stock mínimo te avisa cuando se está acabando la línea que más se mueve.",
      "Cada quien vende con su propio usuario y PIN, cada quien con su corte.",
    ],
  },
  {
    id: "mascotas",
    nombre: "Mascotas",
    icono: "pata",
    frase: "Croquetas, accesorios y consentidos de cuatro patas.",
    mision4: "codigos",
    departamentos: [
      { nombre: "Alimento para perro", icono: "caja" },
      { nombre: "Alimento para gato", icono: "caja" },
      { nombre: "Accesorios", icono: "caja" },
      { nombre: "Higiene y cuidado", icono: "limpieza" },
      { nombre: "Juguetes", icono: "caja" },
    ],
    sugerencias: [
      "El alimento se vende por pieza, kilo o paquete: YvexPOS maneja las unidades como tú las manejas.",
      "El resurtido con foto del ticket de tu proveedor actualiza costos y existencias en un toque.",
      "Los reportes por departamento te dicen si se vende más perro, gato o accesorios.",
    ],
  },
  {
    id: "otro",
    nombre: "Otro giro",
    icono: "puntos",
    frase: "Tu negocio es único, y aquí cabe perfecto.",
    mision4: "codigos",
    departamentos: [],
    sugerencias: [
      "YvexPOS se amolda a tu giro: departamentos, unidades y precios los defines tú.",
      "Vende con o sin internet y revisa cómo va el día en cualquier momento.",
    ],
  },
];

const GIRO_DEFECTO = "otro";

// Paleta neutral para los departamentos sugeridos, rota por orden de creación.
const COLORES_DEPTO = [
  "#e11d48", "#d97706", "#059669", "#2563eb",
  "#7c3aed", "#db2777", "#0891b2", "#65a30d",
];

export function obtenerGiro(id) {
  return GIROS.find((g) => g.id === id) ?? GIROS.find((g) => g.id === GIRO_DEFECTO);
}

export function giroValido(id) {
  return GIROS.some((g) => g.id === id) ? id : GIRO_DEFECTO;
}

/**
 * Lista de departamentos sugeridos para el paso de revisión del onboarding,
 * cada uno con `incluido: true` por defecto (el dueño puede desmarcar o
 * renombrar antes de que se creen). NO toca la base de datos.
 */
export function sugerenciasDepartamentos(giroId) {
  const giro = obtenerGiro(giroId);
  return giro.departamentos.map((d) => ({ ...d, incluido: true }));
}

/**
 * Crea SOLO los departamentos que el dueño dejó marcados, con el nombre
 * que haya quedado tras editar (si editó) y su icono. Se llama al terminar
 * el onboarding, con la lista YA revisada — nunca decide sola qué crear.
 */
export async function crearDepartamentosElegidos(invoke, lista) {
  const elegidos = (lista || []).filter((d) => d.incluido && d.nombre.trim());
  for (let i = 0; i < elegidos.length; i++) {
    const d = elegidos[i];
    await invoke("cat_crear", {
      datos: { nombre: d.nombre.trim(), color: COLORES_DEPTO[i % COLORES_DEPTO.length], icono: d.icono || null },
    });
  }
}
