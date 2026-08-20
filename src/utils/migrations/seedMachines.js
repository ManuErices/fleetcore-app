import { collection, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const MACHINES_DATA = [
  {
    codigo: 'PRXS22', patente: 'PRXS-22', digitoVerificador: '8',
    tipo: 'CAMION COMBUSTIBLE', marca: 'MERCEDES BENZ', modelo: 'ATEGO 2730',
    año: 2000, kmsHrs: 72859, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'GODIESEL SPA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'RFJB46', patente: 'RFJB-46', digitoVerificador: '',
    tipo: 'CAMION COMBUSTIBLE', marca: 'MERCEDES BENZ', modelo: 'AXOR 3131',
    año: 2021, kmsHrs: 713317, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'GODIESEL SPA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'SVDX45', patente: 'SVDX-45', digitoVerificador: '',
    tipo: 'BULLDOZER', marca: 'CATERPILLAR', modelo: 'D8 19B',
    año: 2023, kmsHrs: 4927, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: '', patente: '', digitoVerificador: '',
    tipo: 'MARTILLO HIDRAULICO', marca: 'CATERPILLAR', modelo: 'MARTILLO HIDRAULICO CATERPILLAR',
    año: 2000, kmsHrs: 6729, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'RE-01', patente: 'SWKB-41', digitoVerificador: '',
    tipo: 'RETROEXCAVADORA', marca: 'SANY', modelo: 'BHL75A',
    año: 2024, kmsHrs: 2761, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'RSBB65', patente: 'RSBB-65', digitoVerificador: '8',
    tipo: 'EXCAVADORA', marca: 'CATERPILLAR', modelo: '330 07',
    año: 2025, kmsHrs: 5148, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'SOCIEDAD CONSTRUCTORA E INVERSIONES EL TORO NEGRO LIMITADA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: '110074', patente: '110074', digitoVerificador: '',
    tipo: 'BULLDOZER', marca: 'KOMATSU', modelo: 'D155AX-8E0',
    año: 2026, kmsHrs: 74, proyecto: 'NUEVE COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'SOCIEDAD CONSTRUCTORA E INVERSIONES EL TORO NEGRO LIMITADA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'CF-01', patente: 'TGPD-85', digitoVerificador: '',
    tipo: 'CARGADOR FRONTAL', marca: 'XCMG', modelo: 'XCMG',
    año: 2024, kmsHrs: 1927, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'TTJY25', patente: 'TTJY-25', digitoVerificador: '8',
    tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX DCAB MT 4X4 2.4',
    año: 2025, kmsHrs: 66512, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'ARRIENDOS Y TRANSPORTES SEHA SPA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'TTJX60', patente: 'TTJX-60', digitoVerificador: '',
    tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX',
    año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'EX-02', patente: 'TLPJ-56', digitoVerificador: '',
    tipo: 'EXCAVADORA', marca: 'SANY', modelo: 'SY305H',
    año: 2022, kmsHrs: 2018, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'TYRH70', patente: 'TYRH-70', digitoVerificador: '',
    tipo: 'CAMION COMBUSTIBLE', marca: 'VOLVO', modelo: 'FM X',
    año: 2000, kmsHrs: 18475, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'SPCV53', patente: 'SPCV-53', digitoVerificador: '',
    tipo: 'CAMION ALJIBE', marca: 'MERCEDES BENZ', modelo: 'AROCS 3342K/36 RET',
    año: 2023, kmsHrs: 92389, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'INVERSIONES TREKTRADING SPA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'TBSB36', patente: 'TBSB-36', digitoVerificador: '',
    tipo: 'EXCAVADORA', marca: 'CATERPILLAR', modelo: 'CATERPILLAR 333',
    año: 2025, kmsHrs: 4618, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'TRST29', patente: 'TRST-29', digitoVerificador: '',
    tipo: 'EXCAVADORA', marca: 'KOMATSU', modelo: 'PC 300',
    año: 2025, kmsHrs: 1941, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: '', patente: '', digitoVerificador: '',
    tipo: 'MARTILLO HIDRAULICO', marca: 'KOMATSU', modelo: 'EC140T',
    año: 2000, kmsHrs: 5024, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'THYG91', patente: 'THYG-91', digitoVerificador: '',
    tipo: 'EXCAVADORA', marca: 'KOMATSU', modelo: 'PC 300',
    año: 2025, kmsHrs: 3456, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'VM-09', patente: 'SZHY-22', digitoVerificador: '',
    tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX 2.4 TM 4X4 - DX44MT24 R-3',
    año: 2024, kmsHrs: 32916, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'VM-08', patente: 'SZHY-21', digitoVerificador: '',
    tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX 2.4 TM 4X4 - DX44MT24 R-3',
    año: 2024, kmsHrs: 48499, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'VJDH16', patente: 'VJDH-16', digitoVerificador: '',
    tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX',
    año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'MN-02', patente: 'PPFG-89', digitoVerificador: '',
    tipo: 'MOTONIVELADORA', marca: 'JOHN DEERE', modelo: '672G',
    año: 2021, kmsHrs: 7676, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  // RTX Camionetas
  { codigo: 'TRRH10', patente: 'TRRH-10', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'RTX' },
  { codigo: 'TRRH13', patente: 'TRRH-13', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'RTX' },
  { codigo: 'TRRH14', patente: 'TRRH-14', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'RTX' },
  { codigo: 'VLWC18', patente: 'VLWC-18', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'RTX' },
  { codigo: 'VLWC26', patente: 'VLWC-26', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'RTX' },
  { codigo: 'VLWC72', patente: 'VLWC-72', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'RTX' },
  { codigo: 'TTXR10', patente: 'TTXR-10', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'RTX' },
  { codigo: 'LHPL22', patente: 'LHPL-22', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'RTX' },
  { codigo: 'SXFW71', patente: 'SXFW-71', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'RTX' },
  // Major Drilling
  { codigo: 'TFGS36', patente: 'TFGS-36', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'SLZB34', patente: 'SLZB-34', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'SLZB41', patente: 'SLZB-41', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'SLZB94', patente: 'SLZB-94', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'THCX76', patente: 'THCX-76', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'THCX77', patente: 'THCX-77', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'TKHR17', patente: 'TKHR-17', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'TKHR19', patente: 'TKHR-19', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'VVCX78', patente: 'VVCX-78', tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'VTRF43', patente: 'VTRF-43', tipo: 'MINIBUS', marca: 'HYUNDAI', modelo: 'H1', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'VWJS35', patente: 'VWJS-35', tipo: 'CAMION COMBUSTIBLE', marca: 'MERCEDES BENZ', modelo: 'ATEGO', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'TPCL28', patente: 'TPCL-28', tipo: 'CAMION COMBUSTIBLE', marca: 'MERCEDES BENZ', modelo: 'ATEGO', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'TJSK35', patente: 'TJSK-35', tipo: 'CAMION ALJIBE', marca: 'VOLVO', modelo: 'FM', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'RXRW78', patente: 'RXRW-78', tipo: 'CAMION ALJIBE', marca: 'VOLVO', modelo: 'FM', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'TPJD89', patente: 'TPJD-89', tipo: 'CAMION AMPLIROLL', marca: 'SCANIA', modelo: 'G450', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'TYWW19', patente: 'TYWW-19', tipo: 'CAMION AMPLIROLL', marca: 'SCANIA', modelo: 'G450', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'LZZB73', patente: 'LZZB-73', tipo: 'CAMION PLUMA', marca: 'VOLVO', modelo: 'FMX', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
  { codigo: 'THXL81', patente: 'THXL-81', tipo: 'CAMION BARRA', marca: 'MAN', modelo: 'TGS', año: 2025, kmsHrs: 0, proyecto: 'NUEVO COBRE', propiedad: 'PROPIA', proveedor: '', empresa: 'Major Drilling' },
];

export async function runSeedMachines(empresaId) {
  if (!empresaId) throw new Error('empresaId requerido');

  // 1. Seed companies into 'empresas_combustible' collection if they don't exist
  const empresasCombustibleRef = collection(db, 'empresas', empresaId, 'empresas_combustible');
  const empresasSnapshot = await getDocs(empresasCombustibleRef);
  const existingNames = empresasSnapshot.docs.map(doc => (doc.data().nombre || '').toLowerCase().trim());

  const companiesToSeed = [
    { nombre: 'RTX', rut: '76.123.456-7', giro: 'Minería', contacto: 'Contacto RTX' },
    { nombre: 'MAJOR DRILLING CHILE SA', rut: '96.987.654-3', giro: 'Sondajes', contacto: 'Contacto Major Drilling' }
  ];

  const batchEmpresas = writeBatch(db);
  let addedAny = false;
  companiesToSeed.forEach(c => {
    const normC = c.nombre.toLowerCase().trim();
    if (!existingNames.some(name => name.includes(normC) || normC.includes(name))) {
      const newRef = doc(empresasCombustibleRef);
      batchEmpresas.set(newRef, {
        ...c,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      addedAny = true;
    }
  });
  if (addedAny) {
    await batchEmpresas.commit();
    console.log('[seedMachines] Empresas creadas en empresas_combustible.');
  }

  // 2. Clear and seed machines
  const machinesRef = collection(db, 'empresas', empresaId, 'machines');

  const snapshot = await getDocs(machinesRef);
  console.log(`[seedMachines] Eliminando ${snapshot.size} documentos de máquinas existentes...`);

  const deleteBatch = writeBatch(db);
  snapshot.docs.forEach(d => deleteBatch.delete(d.ref));
  await deleteBatch.commit();
  console.log('[seedMachines] Máquinas eliminadas.');

  const createBatch = writeBatch(db);
  MACHINES_DATA.forEach(machine => {
    const newRef = doc(machinesRef);
    createBatch.set(newRef, {
      ...machine,
      name: machine.tipo,
      code: machine.codigo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await createBatch.commit();
  console.log(`[seedMachines] ${MACHINES_DATA.length} máquinas creadas.`);

  return MACHINES_DATA.length;
}
