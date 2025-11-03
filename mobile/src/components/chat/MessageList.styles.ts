import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#C7C7CC',
  },
});
