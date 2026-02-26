
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import proj4 from 'proj4';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

// Lambert 93 (EPSG:2154) projection definition
proj4.defs(
  'EPSG:2154',
  '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
);

interface Company {
  siret: string;
  siren: string;
  name: string;
  nafCode: string;
  postalCode: string;
  city: string;
  lat: number;
  lon: number;
  isHeadOffice: boolean;
  isActive: boolean;
}

// Cache parsed & projected companies across requests
let companiesCache: Company[] | null = null;

function loadCompanies(): Company[] {
  if (companiesCache) return companiesCache;

  const csvPath = path.join(process.cwd(), 'data', 'sample.csv');
  const content = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(content, { columns: true, skip_empty_lines: true });

  companiesCache = (records as any[])
    .filter(
      (r) =>
        r.coordonneeLambertAbscisseEtablissement &&
        r.coordonneeLambertOrdonneeEtablissement
    )
    .map((r) => {
      const x = parseFloat(r.coordonneeLambertAbscisseEtablissement);
      const y = parseFloat(r.coordonneeLambertOrdonneeEtablissement);
      const [lon, lat] = proj4('EPSG:2154', 'WGS84', [x, y]);
      return {
        siret: r.siret,
        siren: r.siren,
        name: r.denominationUsuelleEtablissement || r.siret,
        nafCode: r.activitePrincipaleEtablissement,
        postalCode: r.codePostalEtablissement,
        city: r.libelleCommuneEtablissement,
        lat,
        lon,
        isHeadOffice: r.etablissementSiege === 'True',
        isActive: r.etatAdministratifEtablissement === 'A',
      };
    });

  console.log(`Loaded ${companiesCache.length} companies from CSV.`);
  return companiesCache;
}

export async function POST(req: NextRequest) {
  const { geometry } = await req.json();

  if (!geometry) {
    return NextResponse.json({ companies: [] });
  }

  const allCompanies = loadCompanies();

  const companies = allCompanies.filter((company) => {
    const pt = point([company.lon, company.lat]);
    return booleanPointInPolygon(pt, geometry);
  });

  console.log(`Found ${companies.length} companies in the drawn area.`);
  return NextResponse.json({ companies });
}
