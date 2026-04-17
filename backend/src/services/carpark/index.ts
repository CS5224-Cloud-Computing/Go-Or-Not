import { API_URLS } from '../../config/api.js';
import { withCarparkCache } from '../../utils/cache.js';
import { dynamoDb } from '../../utils/dynamodb.js';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type {
  CarparkAvailability,
  CarparkMetadata,
  ParkingResponse,
  CarparkApiResponse,
} from './types.js';

const METADATA_TABLE = process.env.CARPARK_METADATA_TABLE!;
const ttl = 15; //in minutes

export class CarparkService {
  async getNearbyParking(
    userLat: number,
    userLng: number,
    radiusKm: number = 1.0,
  ): Promise<ParkingResponse[]> {
    const [metadata, availability] = await Promise.all([
      this.getMetadata(),
      this.getAvailability(),
    ]);

    const availabilityByCarparkNumber = new Map(
      availability.map((item) => [
        this.normalizeCarparkNumber(item.carpark_number),
        item,
      ]),
    );

    return metadata
      .map((cp) => ({
        ...cp,
        distance: this.calculateHaversine(
          userLat,
          userLng,
          Number(cp.latitude),
          Number(cp.longitude),
        ),
      }))
      .filter((cp) => cp.distance! <= radiusKm)
      .map((cp) => {
        const avail = availabilityByCarparkNumber.get(
          this.normalizeCarparkNumber(cp.carpark_number ?? cp.car_park_no ?? ''),
        );
        const carInfo = avail?.carpark_info.find(
          (info) => info.lot_type === 'C'
        );

        return {
          ...cp,
          type: cp.car_park_type,
          system: cp.type_of_parking_system,
          total_lots: parseInt(carInfo?.total_lots || '0'),
          lots_available: parseInt(carInfo?.lots_available || '0'),
        };
      })
      .sort((a, b) => a.distance! - b.distance!);
  }

  private async getMetadata(): Promise<CarparkMetadata[]> {
    const result = await dynamoDb.send(
      new ScanCommand({ TableName: METADATA_TABLE }),
    );
    return (result.Items as CarparkMetadata[]) || [];
  }

  private async getAvailability(): Promise<CarparkAvailability[]> {
    return (
      await withCarparkCache<CarparkAvailability[]>(
        'LATEST_AVAILABILITY',
        ttl,
        'HDB/LTA Availability',
        async () => {
          const response = await fetch(API_URLS.carpark);
          if (!response.ok) {
            throw new Error(
              `API returned ${response.status}: ${response.statusText}`,
            );
          }

          const apiData = (await response.json()) as CarparkApiResponse;

          const items = apiData.items;

          if (!items || items.length === 0) {
            throw new Error('No parking data items available from API');
          }
          const firstItem = items[0];
          if (!firstItem?.carpark_data) {
            throw new Error('Carpark data array is missing');
          }

          return firstItem.carpark_data;
        },
      )
    ).data;
  }

  private normalizeCarparkNumber(carparkNumber: string): string {
    return carparkNumber.trim().toUpperCase();
  }

  private calculateHaversine(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
