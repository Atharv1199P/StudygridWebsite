import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (user) => {
    if (!user) {
      setUserData(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading profile:', error);
      setUserData({
        id: user.id,
        email: user.email,
        name: user.email,
        role: 'student',
      });
      return;
    }

    setUserData({
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role || 'student',
    });
  };

  const register = useCallback(async (email, password, name, role = 'student') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    const user = data.user;

    if (user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: user.id,
        email,
        name,
        role,
        created_at: new Date().toISOString(),
      });

      if (profileError) {
        // eslint-disable-next-line no-console
        console.error('Error creating profile:', profileError);
        throw new Error('Failed to create user profile: ' + profileError.message);
      }

      await loadProfile(user);
    }

    return data;
  }, []);
  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      await loadProfile(data.user);
    }

    return data;
  }, []);
  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error during signOut:', e);
    }
    setCurrentUser(null);
    setUserData(null);

    // Ensure user lands on the Welcome page after logout
    try {
      window.location.replace('/');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error redirecting to welcome after logout:', e);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setCurrentUser(session?.user ?? null);
      if (session?.user) {
        await loadProfile(session.user);
      }
      setLoading(false);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setCurrentUser(session?.user ?? null);
      if (session?.user) {
        await loadProfile(session.user);
      } else {
        setUserData(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    currentUser,
    userData,
    register,
    login,
    logout,
    loading,
  }), [currentUser, userData, register, login, logout, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

