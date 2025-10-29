import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';
import logger from '../services/loggerConfig';

const { width } = Dimensions.get('window');

const ProfileScreen = () => {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    logger.auth('Logout button pressed');

    try {
      logger.auth('Performing logout...');
      const result = await logout();
      logger.auth('Logout completed:', result);
    } catch (error) {
      logger.error('AUTH', 'Logout error:', error);
    }
  };

  const handleQuickAction = action => {
    Alert.alert(
      'Coming Soon',
      `${action} functionality will be available soon!`
    );
  };

  const getConnectionStatus = () => {
    const status = socketService.getConnectionStatus();
    return status.isConnected ? 'Connected' : 'Disconnected';
  };

  const getInitials = name => {
    return name
      ? name
          .split(' ')
          .map(n => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : 'U';
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Beautiful Header with Gradient */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerContent}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getInitials(user?.displayName || user?.username)}
              </Text>
            </View>
            <TouchableOpacity style={styles.editAvatarButton}>
              <Ionicons name="camera" size={16} color="#667eea" />
            </TouchableOpacity>
          </View>

          <Text style={styles.displayName}>
            {user?.displayName || user?.username || 'User'}
          </Text>
          <Text style={styles.username}>@{user?.username}</Text>

          <View style={styles.connectionStatus}>
            <View
              style={[
                styles.statusDot,
                getConnectionStatus() === 'Connected'
                  ? styles.statusConnected
                  : styles.statusDisconnected,
              ]}
            />
            <Text style={styles.statusText}>{getConnectionStatus()}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => handleQuickAction('Edit Profile')}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['#4facfe', '#00f2fe']}
              style={styles.quickActionIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="person-outline" size={20} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.quickActionText}>Edit Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => handleQuickAction('Settings')}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={styles.quickActionIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.quickActionText}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => handleQuickAction('Share Profile')}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['#a8edea', '#fed6e3']}
              style={styles.quickActionIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="share-outline" size={20} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.quickActionText}>Share Profile</Text>
          </TouchableOpacity>
        </View>

        {/* User Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="mail-outline" size={20} color="#8E8E93" />
            <Text style={styles.infoText}>{user?.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color="#8E8E93" />
            <Text style={styles.infoText}>
              Joined{' '}
              {new Date().toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </Text>
          </View>
        </View>

        {/* Stats Card */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Messages</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>Groups</Text>
          </View>
        </View>

        {/* About Finnigram */}
        <TouchableOpacity
          style={styles.aboutCard}
          onPress={() =>
            Alert.alert(
              'About Finnigram',
              'The messaging app that helps you be a better friend, partner, and family member.\n\nBuilt with ❤️ by Finn'
            )
          }
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.aboutIcon}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="information-circle" size={24} color="#FFFFFF" />
          </LinearGradient>
          <View style={styles.aboutContent}>
            <Text style={styles.aboutTitle}>About Finnigram</Text>
            <Text style={styles.aboutSubtitle}>
              Version 1.0.0 • Tap to learn more
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  headerGradient: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 12,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusConnected: {
    backgroundColor: '#34C759',
  },
  statusDisconnected: {
    backgroundColor: '#FF3B30',
  },
  statusText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    marginTop: -20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#F2F2F7',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginTop: 30,
    paddingVertical: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  quickActionButton: {
    alignItems: 'center',
    flex: 1,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionText: {
    fontSize: 12,
    color: '#3C3C43',
    fontWeight: '500',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoText: {
    fontSize: 16,
    color: '#3C3C43',
    marginLeft: 12,
    flex: 1,
  },
  aboutCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 20,
    borderRadius: 16,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3C3C43',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E5EA',
    marginHorizontal: 20,
  },
  aboutIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  aboutContent: {
    flex: 1,
  },
  aboutTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3C3C43',
    marginBottom: 2,
  },
  aboutSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
  },
  logoutButton: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    cursor: 'pointer',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
    marginLeft: 8,
  },
  bottomSpacer: {
    height: 40,
  },
});

export default ProfileScreen;
