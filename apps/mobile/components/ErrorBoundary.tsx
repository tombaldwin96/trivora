import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
};

/**
 * Catches JavaScript errors in the child tree to prevent full app crashes,
 * e.g. under realtime/message overload or unhandled exceptions.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    try {
      this.setState((s) => ({ ...s, componentStack: errorInfo.componentStack ?? null }));
      if (__DEV__) {
        console.error('ErrorBoundary caught:', error, errorInfo.componentStack);
      }
    } catch {
      // Avoid any secondary failure while reporting
    }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      const err = this.state.error;
      const message = err?.message ?? String(err);
      const stack = this.state.componentStack;
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            The app hit an error. Try again or restart the app.
          </Text>
          <Text style={styles.errorDetail} numberOfLines={8}>
            {message}
          </Text>
          {stack ? (
            <Text style={styles.stackDetail} numberOfLines={6}>
              {stack}
            </Text>
          ) : null}
          <Pressable
            style={styles.button}
            onPress={() =>
              this.setState({ hasError: false, error: null, componentStack: null })
            }
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 12,
  },
  errorDetail: {
    fontSize: 12,
    color: '#dc2626',
    fontFamily: 'monospace',
    marginBottom: 8,
    maxWidth: '100%',
  },
  stackDetail: {
    fontSize: 10,
    color: '#64748b',
    fontFamily: 'monospace',
    marginBottom: 24,
    maxWidth: '100%',
  },
  button: {
    backgroundColor: '#5b21b6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
