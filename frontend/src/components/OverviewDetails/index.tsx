import { Dialog } from 'radix-ui';
import styles from './styles.module.scss';
import { X } from 'lucide-react';
import type { RecommendationResponse } from '../../types/recommendation';
import { AccordionSection } from './components/accordionSection';
import { useMemo } from 'react';
import { IndicatorBanner } from './components/indicatorBanner';
import { Accordion } from 'radix-ui';

interface OverviewDetailsProps {
  recommendationData: RecommendationResponse;
}

export const OverviewDetails: React.FC<OverviewDetailsProps> = ({
  recommendationData,
}) => {
  const toTierFromScore = (score: number): 'GO' | 'MAYBE' | 'NO_GO' => {
    if (score >= 0.7) return 'GO';
    if (score >= 0.4) return 'MAYBE';
    return 'NO_GO';
  };

  const toPm25Category = (
    value: number | undefined,
  ): {
    label: string;
    recommendation: 'GO' | 'MAYBE' | 'NO_GO';
  } => {
    if (value == null) {
      return { label: 'Unknown', recommendation: 'MAYBE' };
    }

    if (value <= 50) return { label: 'Good (0-50)', recommendation: 'GO' };
    if (value <= 100)
      return { label: 'Moderate (51-100)', recommendation: 'MAYBE' };
    if (value <= 150)
      return {
        label: 'Unhealthy for Sensitive Groups (101-150)',
        recommendation: 'MAYBE',
      };
    if (value <= 200)
      return { label: 'Unhealthy (151-200)', recommendation: 'NO_GO' };
    if (value <= 300)
      return { label: 'Very Unhealthy (201-300)', recommendation: 'NO_GO' };
    return { label: 'Hazardous (301+)', recommendation: 'NO_GO' };
  };

  const sections: { title: string; content: React.ReactNode }[] =
    useMemo(() => {
      if (!recommendationData) return [];
      const result = [];
      const recommendationDetails = recommendationData.details;
      const weatherMetadata =
        recommendationDetails.weatherMetadata?.data ??
        recommendationDetails.weatherMetadata;

      if (weatherMetadata.temperature) {
        const score = recommendationData.factors.temperatureScore;
        const status = toTierFromScore(score);
        const currentTemperature =
          recommendationData.factors.temperatureValue ??
          weatherMetadata.temperature.data.temperature;

        result.push({
          title: 'Weather/Temperature',
          content: (
            <>
              <IndicatorBanner
                text={`Current temperature is ${currentTemperature.toFixed(1)}°C`}
                recommendation={status}
              />
              <div className={styles.detailsText}>
                <p>
                  The estimated baseline temperature now is{' '}
                  <b>{recommendationData.factors.temperatureBaseline}°C</b>
                </p>
                <p>
                  The temperature condition is{' '}
                  <b>
                    {score >= 0.7
                      ? 'ideal'
                      : score >= 0.4
                        ? 'moderate'
                        : 'unfavorable'}{' '}
                  </b>{' '}
                  for outdoor activities.
                </p>
              </div>
            </>
          ),
        });
      }

      if (weatherMetadata.psi) {
        // const psiValue =
        //   recommendationData.factors.psiValue ??
        //   weatherMetadata.psi.data.psiTwentyFourHourly;

        const pm25Value = weatherMetadata.psi.data.pm25TwentyFourHourly;
        const pm25Category = toPm25Category(pm25Value);

        result.push({
          title: 'PM2.5 Details',
          content: (
            <>
              <IndicatorBanner
                text={`PM2.5 is ${pm25Value ?? 'N/A'} — ${pm25Category.label}`}
                recommendation={pm25Category.recommendation}
              />
              <div className={styles.detailsText}>
                <p>Typical Air Quality Index (AQI) categories for PM2.5:</p>
                <ul>
                  <li>
                    <b>Good (0-50):</b> Air quality is satisfactory, and air
                    pollution poses little or no risk.
                  </li>
                  <li>
                    <b>Moderate (51-100):</b> Acceptable for most; however,
                    sensitive individuals may experience health effects.
                  </li>
                  <li>
                    <b>Unhealthy for Sensitive Groups (101-150):</b> Children,
                    elderly, and people with respiratory/heart disease are at
                    greater risk.
                  </li>
                  <li>
                    <b>Unhealthy (151-200):</b> Everyone may begin to experience
                    health effects.
                  </li>
                  <li>
                    <b>Very Unhealthy (201-300):</b> Health alert; everyone
                    should avoid prolonged outdoor exertion.
                  </li>
                  <li>
                    <b>Hazardous (301+):</b> Emergency conditions for the entire
                    population.
                  </li>
                </ul>
              </div>
            </>
          ),
        });
      }

      if (weatherMetadata.uv) {
        const uvValue =
          recommendationData.factors.uvValue ?? weatherMetadata.uv.data.value;
        const status = toTierFromScore(recommendationData.factors.uvScore);

        result.push({
          title: 'UV Index',
          content: (
            <>
              <IndicatorBanner
                text={`UV index is ${uvValue ?? 'N/A'}`}
                recommendation={status}
              />
              <div className={styles.detailsText}>
                <p>
                  UV score contribution:{' '}
                  <b>{recommendationData.factors.uvScore.toFixed(2)}</b>
                </p>
              </div>
            </>
          ),
        });
      }

      if (recommendationDetails.parking) {
        const status = toTierFromScore(recommendationData.factors.parkingScore);

        result.push({
          title: 'Parking',
          content: (
            <>
              <IndicatorBanner
                text={`Empty lots detected: ${recommendationData.factors.parkingEmptyLotsAbsolute}`}
                recommendation={status}
              />
              <div className={styles.detailsText}>
                <p>
                  Parking occupancy score:{' '}
                  <b>
                    {recommendationData.factors.parkingOccupancyScore.toFixed(
                      2,
                    )}
                  </b>
                </p>
                <p>
                  Parking score contribution:{' '}
                  <b>{recommendationData.factors.parkingScore.toFixed(2)}</b>
                </p>
              </div>
            </>
          ),
        });
      }
      return result;
    }, [recommendationData]);

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className={styles.triggerButton}>Why?</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>
            <h2 className={styles.titleText}>Condition Details</h2>
            <Dialog.Close asChild>
              <button className={styles.closeButton}>
                <X width={20} height={20} />
              </button>
            </Dialog.Close>
          </Dialog.Title>
          <div className={styles.popoverContent}>
            <p
              style={{
                paddingTop: 12,
                paddingBottom: 12,
                color: `${toTierFromScore(recommendationData.score) === 'GO' ? '#008E9B' : toTierFromScore(recommendationData.score) === 'MAYBE' ? '#CC7400' : '#C80000'}`,
              }}
            >
              <b>
                {recommendationData.recommendation} (
                {(recommendationData.score * 100).toFixed(1)}%)
              </b>
              : {recommendationData.summary}
            </p>
            <Accordion.Root type='multiple' className={styles.accordionRoot}>
              {sections.map((section) => {
                return (
                  <AccordionSection key={section.title} title={section.title}>
                    {section.content}
                  </AccordionSection>
                );
              })}
            </Accordion.Root>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
