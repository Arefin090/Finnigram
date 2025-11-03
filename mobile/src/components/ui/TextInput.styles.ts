import { StyleSheet, Platform } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000000',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  inputContainerError: {
    borderColor: '#FF3B30',
    backgroundColor: '#FFF5F5',
  },
  inputContainerDisabled: {
    backgroundColor: '#F8F8F8',
    opacity: 0.6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  inputWithLeftIcon: {
    marginLeft: 8,
  },
  inputWithRightIcon: {
    marginRight: 8,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
    paddingBottom: 12,
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    marginTop: 4,
    marginLeft: 4,
  },
});
