// Geografía de Perú para el scraper de /c-peru. Los 24 departamentos más la
// Provincia Constitucional del Callao; las ciudades son capitales de provincia
// y los núcleos urbanos donde hay comercio automotor. El campo de ciudad
// acepta texto libre, así que lo que no figura acá igual se puede buscar.

export const PE_DEPARTMENTS = [
  "Amazonas",
  "Áncash",
  "Apurímac",
  "Arequipa",
  "Ayacucho",
  "Cajamarca",
  "Callao",
  "Cusco",
  "Huancavelica",
  "Huánuco",
  "Ica",
  "Junín",
  "La Libertad",
  "Lambayeque",
  "Lima",
  "Loreto",
  "Madre de Dios",
  "Moquegua",
  "Pasco",
  "Piura",
  "Puno",
  "San Martín",
  "Tacna",
  "Tumbes",
  "Ucayali",
];

export const PE_CITIES: Record<string, string[]> = {
  Amazonas: ["Chachapoyas", "Bagua", "Bagua Grande", "Pedro Ruiz"],
  "Áncash": ["Huaraz", "Chimbote", "Nuevo Chimbote", "Casma", "Huarmey", "Caraz", "Yungay"],
  "Apurímac": ["Abancay", "Andahuaylas", "Chalhuanca"],
  Arequipa: ["Arequipa", "Camaná", "Mollendo", "Mejía", "Majes", "Cayma", "Cerro Colorado", "Yanahuara", "Paucarpata", "Sachaca", "Socabaya", "Miraflores", "José Luis Bustamante y Rivero"],
  Ayacucho: ["Ayacucho", "Huanta", "Puquio", "Cora Cora"],
  Cajamarca: ["Cajamarca", "Jaén", "Chota", "Cutervo", "San Ignacio"],
  Callao: ["Callao", "Bellavista", "La Perla", "La Punta", "Carmen de la Legua Reynoso", "Ventanilla", "Mi Perú"],
  Cusco: ["Cusco", "Wanchaq", "San Sebastián", "San Jerónimo", "Santiago", "Quillabamba", "Sicuani", "Urubamba", "Calca", "Espinar"],
  Huancavelica: ["Huancavelica", "Lircay", "Pampas"],
  "Huánuco": ["Huánuco", "Tingo María", "Leoncio Prado", "Ambo"],
  Ica: ["Ica", "Chincha Alta", "Pisco", "Nasca", "Palpa", "San Clemente", "Paracas"],
  "Junín": ["Huancayo", "El Tambo", "Chilca", "Jauja", "Tarma", "La Oroya", "Satipo", "Chanchamayo", "La Merced", "Concepción"],
  "La Libertad": ["Trujillo", "Víctor Larco Herrera", "La Esperanza", "El Porvenir", "Florencia de Mora", "Huanchaco", "Chepén", "Pacasmayo", "Guadalupe", "Huamachuco", "Ascope", "Casa Grande", "Paiján"],
  Lambayeque: ["Chiclayo", "José Leonardo Ortiz", "La Victoria", "Pimentel", "Lambayeque", "Ferreñafe", "Monsefú", "Reque"],
  Lima: ["Lima", "Huacho", "Barranca", "Huaral", "Cañete", "San Vicente de Cañete", "Chancay", "Huaura", "Supe", "Cajatambo", "Oyón", "Yauyos"],
  Loreto: ["Iquitos", "Yurimaguas", "Nauta", "Requena", "Contamana", "Punchana", "San Juan Bautista", "Belén"],
  "Madre de Dios": ["Puerto Maldonado", "Iberia", "Iñapari"],
  Moquegua: ["Moquegua", "Ilo", "Omate"],
  Pasco: ["Cerro de Pasco", "Oxapampa", "Villa Rica", "Chaupimarca"],
  Piura: ["Piura", "Castilla", "Sullana", "Paita", "Talara", "Chulucanas", "Sechura", "Catacaos", "Máncora", "Tambogrande"],
  Puno: ["Puno", "Juliaca", "San Román", "Ilave", "Azángaro", "Ayaviri", "Desaguadero", "Yunguyo", "Macusani"],
  "San Martín": ["Tarapoto", "Moyobamba", "Rioja", "Juanjuí", "Nueva Cajamarca", "Bellavista", "Tocache", "Morales", "La Banda de Shilcayo"],
  Tacna: ["Tacna", "Alto de la Alianza", "Ciudad Nueva", "Pocollay", "Gregorio Albarracín"],
  Tumbes: ["Tumbes", "Zarumilla", "Aguas Verdes", "Zorritos", "Corrales"],
  Ucayali: ["Pucallpa", "Callería", "Yarinacocha", "Manantay", "Aguaytía", "Atalaya"],
};

// Distritos/zonas de las ciudades grandes: sirven para acotar la búsqueda, igual
// que los barrios en Argentina. Clave = ciudad dentro de su departamento.
export const PE_DISTRICTS: Record<string, Record<string, string[]>> = {
  Lima: {
    Lima: [
      "Ancón", "Ate", "Barranco", "Breña", "Carabayllo", "Chaclacayo", "Chorrillos", "Cieneguilla",
      "Comas", "El Agustino", "Independencia", "Jesús María", "La Molina", "La Victoria", "Lima Cercado",
      "Lince", "Los Olivos", "Lurigancho-Chosica", "Lurín", "Magdalena del Mar", "Miraflores",
      "Pachacámac", "Pucusana", "Pueblo Libre", "Puente Piedra", "Punta Hermosa", "Punta Negra",
      "Rímac", "San Bartolo", "San Borja", "San Isidro", "San Juan de Lurigancho",
      "San Juan de Miraflores", "San Luis", "San Martín de Porres", "San Miguel", "Santa Anita",
      "Santa María del Mar", "Santa Rosa", "Santiago de Surco", "Surquillo", "Villa El Salvador",
      "Villa María del Triunfo",
    ],
  },
  Arequipa: {
    Arequipa: [
      "Cercado", "Alto Selva Alegre", "Cayma", "Cerro Colorado", "Characato", "Jacobo Hunter",
      "José Luis Bustamante y Rivero", "Mariano Melgar", "Miraflores", "Paucarpata", "Sachaca",
      "Socabaya", "Tiabaya", "Yanahuara", "Yura",
    ],
  },
  "La Libertad": {
    Trujillo: [
      "Trujillo", "El Porvenir", "Florencia de Mora", "Huanchaco", "La Esperanza", "Laredo",
      "Moche", "Salaverry", "Víctor Larco Herrera",
    ],
  },
  Lambayeque: {
    Chiclayo: ["Chiclayo", "José Leonardo Ortiz", "La Victoria", "Pimentel", "Reque", "Monsefú", "Santa Rosa"],
  },
  Piura: {
    Piura: ["Piura", "Castilla", "Catacaos", "Veintiséis de Octubre", "Tambogrande"],
  },
  Cusco: {
    Cusco: ["Cusco", "San Sebastián", "San Jerónimo", "Santiago", "Wanchaq", "Saylla"],
  },
  Callao: {
    Callao: ["Callao", "Bellavista", "Carmen de la Legua Reynoso", "La Perla", "La Punta", "Mi Perú", "Ventanilla"],
  },
};

/** Cuadro delimitador de Perú (lat/lng), con margen: valida puntos del mapa. */
export const PE_BOUNDS = { minLat: -18.5, maxLat: 0.1, minLng: -81.5, maxLng: -68.5 };

export function isInsidePeru(lat: number, lng: number): boolean {
  return lat >= PE_BOUNDS.minLat && lat <= PE_BOUNDS.maxLat && lng >= PE_BOUNDS.minLng && lng <= PE_BOUNDS.maxLng;
}

/** Normaliza el nombre de departamento que devuelve Google/OSM al de nuestra lista. */
export function matchPeruDepartment(raw: string | null | undefined): string {
  if (!raw) return "";
  const clean = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(departamento|region|provincia constitucional|provincia) (de |del )?/, "")
    .replace(/\s+region$/, "")
    .trim();
  const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return PE_DEPARTMENTS.find((d) => strip(d) === clean) ??
    PE_DEPARTMENTS.find((d) => clean.includes(strip(d))) ?? "";
}
