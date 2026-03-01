export type Region = 'west' | 'east' | 'central' | 'south' | 'north';

export const REGIONS: Region[] = ['west', 'east', 'central', 'south', 'north'];

export const isValidRegion = (value: string): value is Region =>
  (REGIONS as string[]).includes(value);

export interface PsiReading {
  region: Region;
  labelLocation: {
    latitude: number;
    longitude: number;
  };
  timestamp: string;
  psiTwentyFourHourly: number;
  pm25TwentyFourHourly: number;
  pm10TwentyFourHourly: number;
  pm25SubIndex: number;
  pm10SubIndex: number;
  o3SubIndex: number;
  o3EightHourMax: number;
  no2OneHourMax: number;
  so2SubIndex: number;
  so2TwentyFourHourly: number;
  coSubIndex: number;
  coEightHourMax: number;
}

export type RegionValues = Record<Region, number>;

export interface PsiApiResponse {
  code: number;
  errorMsg: string;
  data: {
    regionMetadata: Array<{
      name: Region;
      labelLocation: {
        latitude: number;
        longitude: number;
      };
    }>;
    items: Array<{
      date: string;
      updatedTimestamp: string;
      timestamp: string;
      readings: {
        o3_sub_index: RegionValues;
        no2_one_hour_max: RegionValues;
        o3_eight_hour_max: RegionValues;
        psi_twenty_four_hourly: RegionValues;
        pm10_twenty_four_hourly: RegionValues;
        pm10_sub_index: RegionValues;
        pm25_twenty_four_hourly: RegionValues;
        so2_sub_index: RegionValues;
        pm25_sub_index: RegionValues;
        so2_twenty_four_hourly: RegionValues;
        co_eight_hour_max: RegionValues;
        co_sub_index: RegionValues;
      };
    }>;
  };
}
