import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { CircleCheckIcon, XCircleIcon } from 'lucide-react';
import styles from './NotificationVerify.module.scss';

type VerifyState = 'idle' | 'loading' | 'success' | 'error';

const NotificationVerify = () => {
  const [searchParams] = useSearchParams();
  const subscriptionKey = searchParams.get('subscriptionKey');
  const token = searchParams.get('token');
  const hasRequiredParams = Boolean(subscriptionKey && token);
  const [state, setState] = useState<VerifyState>(
    hasRequiredParams ? 'idle' : 'error',
  );
  const [message, setMessage] = useState(
    hasRequiredParams ? '' : 'Verification link is incomplete.',
  );

  useEffect(() => {
    if (!hasRequiredParams) {
      return;
    }

    const runVerification = async () => {
      setState('loading');
      try {
        const normalizedApiBase = API_BASE_URL.endsWith('/')
          ? API_BASE_URL
          : `${API_BASE_URL}/`;
        const endpoint = new URL('notifications/verify', normalizedApiBase);
        endpoint.searchParams.set('subscriptionKey', subscriptionKey!);
        endpoint.searchParams.set('token', token!);

        const response = await fetch(endpoint.toString());
        const payload = await response.json();

        if (!response.ok) {
          setState('error');
          setMessage(payload.error ?? 'Failed to verify subscription.');
          return;
        }

        setState('success');
        setMessage(payload.message ?? 'Subscription verified successfully.');
      } catch {
        setState('error');
        setMessage(
          'Unable to reach verification service. Please try again later.',
        );
      }
    };

    runVerification();
  }, [hasRequiredParams, subscriptionKey, token]);

  const color = state === 'error' ? '#C80000' : '#008E9B';

  return (
    <div className='should-i-go'>
      <div className={styles.notificationCard}>
        {state === 'success' ? (
          <CircleCheckIcon size={48} color={color} />
        ) : state === 'error' ? (
          <XCircleIcon size={48} color={color} />
        ) : null}
        <div className={styles.notifContent}>
          <h2 style={{ marginBottom: 8 }}>Notification Verification</h2>
          {state === 'loading' ? (
            <p style={{ color: '#666' }}>Verifying your subscription...</p>
          ) : (
            <p style={{ color, fontWeight: 600 }}>{message}</p>
          )}
        </div>
      </div>
      <a href='/' className={styles.backLink}>
        Back to Home
      </a>
    </div>
  );
};

export default NotificationVerify;
