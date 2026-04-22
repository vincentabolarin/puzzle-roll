import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../src/stores/auth.store';
import { apiClient } from '../../src/lib/api-client';
import { queryKeys } from '../../src/lib/query-client';
import { authService } from '../../src/services/auth.service';
import { useAppTheme } from '../../src/hooks/useAppTheme';

interface StatRow { gameType: string; gamesCompleted: number; bestTime: number | null; currentStreak: number; longestStreak: number; }
const GAME_LABELS: Record<string, string> = { sudoku:'Sudoku',queens:'Queens',zip:'Zip',tango:'Tango',nonogram:'Nonogram',minesweeper:'Minesweeper',kakuro:'Kakuro',light_up:'Light Up',futoshiki:'Futoshiki',hitori:'Hitori' };
function formatTime(s: number | null): string { if (s === null) return '—'; return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }
function sanitiseEmail(raw: string): string { return raw.trim().toLowerCase().replace(/\s+/g,''); }

export default function ProfileScreen() {
  const { user } = useAuthStore();
  const t = useAppTheme();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [upgrading, setUpgrading] = useState(false);

  const { data: stats } = useQuery({ queryKey: queryKeys.user.stats, queryFn: () => apiClient.get<StatRow[]>('/users/me/stats'), enabled: !!user });

  const handleLogout = () => Alert.alert('Log out','Are you sure?',[{text:'Cancel',style:'cancel'},{text:'Log out',style:'destructive',onPress:async()=>{ await authService.logout(); router.replace('/'); }}]);

  const handleUpgrade = async () => {
    const cleanEmail = sanitiseEmail(email);
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { Alert.alert('Invalid email','Please enter a valid email address.'); return; }
    if (password.length < 8) { Alert.alert('Weak password','Password must be at least 8 characters.'); return; }
    setUpgrading(true);
    try { await authService.upgradeAccount(cleanEmail, password); setShowUpgrade(false); Alert.alert('Account created','Your progress is now saved.'); }
    catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setUpgrading(false); }
  };

  const totalCompleted = stats?.reduce((s,r)=>s+(r.gamesCompleted??0),0)??0;
  const bestStreak = stats?.reduce((s,r)=>Math.max(s,r.longestStreak??0),0)??0;
  const initial = user?.isAnonymous ? '?' : (user?.email?.[0]??'?').toUpperCase();
  const displayName = user==null?'Logged out':user.isAnonymous?'Guest Player':user.email??'Player';
  const displaySub = user==null?'Not signed in':user.isAnonymous?'Progress not saved':'Progress synced to cloud';

  return (
    <SafeAreaView style={[S.safe,{backgroundColor:t.background}]} edges={['top']}>
      <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>
        <Text style={[S.heading,{color:t.textPrimary}]}>Profile</Text>

        <View style={[S.card,{backgroundColor:t.surface,borderColor:t.borderSubtle}]}>
          <View style={S.identityRow}>
            <View style={S.avatar}><Text style={S.avatarText}>{initial}</Text></View>
            <View style={{flex:1}}>
              <Text style={[S.nameText,{color:t.textPrimary}]} numberOfLines={1}>{displayName}</Text>
              <Text style={[S.subText,{color:t.textMuted}]}>{displaySub}</Text>
            </View>
          </View>
        </View>

        {user==null&&(
          <View style={{gap:10,marginBottom:24}}>
            <TouchableOpacity style={S.primaryBtn} onPress={()=>router.push('/(auth)/login' as never)}><Text style={S.primaryBtnText}>Log in</Text></TouchableOpacity>
            <TouchableOpacity style={[S.secondaryBtn,{backgroundColor:t.surface,borderColor:t.border}]} onPress={()=>router.push('/(auth)/register' as never)}><Text style={[S.secondaryBtnText,{color:t.textPrimary}]}>Create account</Text></TouchableOpacity>
          </View>
        )}

        {user?.isAnonymous&&!showUpgrade&&(
          <TouchableOpacity style={[S.upgradeBtn,{borderColor:t.accent}]} onPress={()=>setShowUpgrade(true)}>
            <Text style={[S.upgradeBtnText,{color:t.accentLight}]}>Create account to save progress →</Text>
          </TouchableOpacity>
        )}

        {user?.isAnonymous&&showUpgrade&&(
          <View style={[S.card,{backgroundColor:t.surface,borderColor:t.borderSubtle,padding:20,marginBottom:20}]}>
            <Text style={[S.sectionTitle,{color:t.textPrimary}]}>Create account</Text>
            <TextInput style={[S.input,{backgroundColor:t.surface2,color:t.textPrimary,borderColor:t.border}]} placeholder="Email" placeholderTextColor={t.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false}/>
            <TextInput style={[S.input,{backgroundColor:t.surface2,color:t.textPrimary,borderColor:t.border}]} placeholder="Password (min 8 characters)" placeholderTextColor={t.textMuted} value={password} onChangeText={setPassword} secureTextEntry/>
            <TouchableOpacity style={[S.primaryBtn,upgrading&&{opacity:0.6}]} onPress={handleUpgrade} disabled={upgrading}><Text style={S.primaryBtnText}>{upgrading?'Saving…':'Save account'}</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>setShowUpgrade(false)} style={{marginTop:10,alignItems:'center'}}><Text style={{color:t.textMuted,fontFamily:'SpaceGrotesk-Regular',fontSize:13}}>Cancel</Text></TouchableOpacity>
          </View>
        )}

        {(stats??[]).length>0&&(
          <View style={[S.quickStats,{backgroundColor:t.surface,borderColor:t.borderSubtle}]}>
            <View style={S.quickStatBox}><Text style={[S.quickStatValue,{color:t.textPrimary}]}>{totalCompleted}</Text><Text style={[S.quickStatLabel,{color:t.textMuted}]}>Completed</Text></View>
            <View style={[S.quickStatDivider,{backgroundColor:t.borderSubtle}]}/>
            <View style={S.quickStatBox}><Text style={[S.quickStatValue,{color:t.textPrimary}]}>{bestStreak}</Text><Text style={[S.quickStatLabel,{color:t.textMuted}]}>Best streak</Text></View>
          </View>
        )}

        {(stats??[]).length>0&&(
          <>
            <Text style={[S.sectionTitle,{color:t.textPrimary,marginBottom:10}]}>Game stats</Text>
            <View style={[S.card,{backgroundColor:t.surface,borderColor:t.borderSubtle}]}>
              {(stats??[]).map((stat,i)=>(
                <View key={stat.gameType} style={[S.statRow,i<(stats??[]).length-1&&{borderBottomWidth:1,borderBottomColor:t.borderSubtle}]}>
                  <Text style={[S.statGame,{color:t.textPrimary}]}>{GAME_LABELS[stat.gameType]??stat.gameType}</Text>
                  <Text style={[S.statValue,{color:t.textSecondary}]}>{formatTime(stat.bestTime)}</Text>
                  <Text style={[S.statStreak,{color:t.textSecondary}]}>🔥 {stat.currentStreak}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {user?.isAnonymous&&<TouchableOpacity style={[S.secondaryBtn,{backgroundColor:t.surface,borderColor:t.border,marginTop:8}]} onPress={()=>router.push('/(auth)/login' as never)}><Text style={[S.secondaryBtnText,{color:t.accentLight}]}>Already have an account? Log in</Text></TouchableOpacity>}
        {!user?.isAnonymous&&user!=null&&<TouchableOpacity style={[S.dangerBtn,{backgroundColor:t.surface,borderColor:t.border}]} onPress={handleLogout}><Text style={S.dangerBtnText}>Log out</Text></TouchableOpacity>}
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  safe:{flex:1}, content:{paddingHorizontal:16,paddingTop:16,paddingBottom:96},
  heading:{fontFamily:'SpaceGrotesk-Bold',fontSize:28,marginBottom:20},
  card:{borderRadius:16,borderWidth:1,marginBottom:16,overflow:'hidden'},
  identityRow:{flexDirection:'row',alignItems:'center',padding:16},
  avatar:{width:52,height:52,borderRadius:26,backgroundColor:'#6366f1',alignItems:'center',justifyContent:'center',marginRight:14,flexShrink:0},
  avatarText:{color:'#fff',fontFamily:'SpaceGrotesk-Bold',fontSize:22},
  nameText:{fontFamily:'SpaceGrotesk-Medium',fontSize:16,marginBottom:3},
  subText:{fontFamily:'SpaceGrotesk-Regular',fontSize:12},
  upgradeBtn:{borderRadius:14,paddingVertical:14,paddingHorizontal:20,borderWidth:1,marginBottom:16,alignItems:'center'},
  upgradeBtnText:{fontFamily:'SpaceGrotesk-Medium',fontSize:14},
  sectionTitle:{fontFamily:'SpaceGrotesk-Bold',fontSize:16},
  input:{borderRadius:12,paddingHorizontal:14,paddingVertical:12,fontFamily:'SpaceGrotesk-Regular',fontSize:14,marginBottom:10,borderWidth:1},
  primaryBtn:{backgroundColor:'#6366f1',borderRadius:12,paddingVertical:13,alignItems:'center',marginBottom:8},
  primaryBtnText:{color:'#fff',fontFamily:'SpaceGrotesk-Bold',fontSize:15},
  quickStats:{flexDirection:'row',borderRadius:16,borderWidth:1,marginBottom:20,padding:20},
  quickStatBox:{flex:1,alignItems:'center'},
  quickStatValue:{fontFamily:'SpaceGrotesk-Bold',fontSize:28,marginBottom:4},
  quickStatLabel:{fontFamily:'SpaceGrotesk-Regular',fontSize:12},
  quickStatDivider:{width:1,marginHorizontal:16},
  statRow:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingVertical:12},
  statGame:{flex:1,fontFamily:'SpaceGrotesk-Medium',fontSize:13},
  statValue:{fontFamily:'JetBrainsMono-Regular',fontSize:12,marginRight:16},
  statStreak:{fontFamily:'SpaceGrotesk-Regular',fontSize:12},
  secondaryBtn:{borderRadius:14,paddingVertical:14,alignItems:'center',borderWidth:1,marginBottom:12},
  secondaryBtnText:{fontFamily:'SpaceGrotesk-Medium',fontSize:14},
  dangerBtn:{borderRadius:14,paddingVertical:14,alignItems:'center',borderWidth:1},
  dangerBtnText:{color:'#f87171',fontFamily:'SpaceGrotesk-Medium',fontSize:14},
});