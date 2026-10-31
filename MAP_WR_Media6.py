import pandas as pd
import numpy as np

def run_compound(TARGET_COMPOUND):
    # Simulate one target compound
    print("Active ingredient：" + TARGET_COMPOUND)

    # Output：construct dataframes
    condata = pd.DataFrame()
    con_Xdata = pd.DataFrame()
    massdata = pd.DataFrame()
    mass_Xdata = pd.DataFrame()
    Fluxdata = pd.DataFrame()
    Fluxlgdata = pd.DataFrame()

    # Default parameters
    Fixpara = {'T': 293.15, 't': 0.72,
               'α_acid': 1, 'α_base': -1, 'ks': 0.3, 'Act': 0.5, 'R': 8.314,
               'v_wind': 3, 'P_SoilW': 2e-6, 'P_SoilA_n': 0.02, 'P_Sed_W': 0.0001, 'P_W_Sed': 0.01,
               'ε_coll': 2e+5, 'v_dd': 3.6, 'v_sedi': 0.104, 'v_res': 2.78e-6, 'v_buri': 3.42e-7}
    ρS = {'A': 2, 'Ns': 2.5, 'As': 2.5, 'Us': 2.5, 'W': 2.5, 'Sed': 2.5}
    IonStr = {'A': 2e-4, 'Ns': 0.03, 'As': 0.03, 'Us': 0.03, 'W': 0.003, 'Sed': 0.003}

    # Input physicochemical and application parameters
    Pestpara_all = pd.read_excel('Input_Para_6.xlsx', sheet_name='Physicochemical_para')
    PestApp_all = pd.read_excel('Input_Para_6.xlsx', sheet_name='Application')

    # Select one compound from the input tables
    Pestpara = Pestpara_all[Pestpara_all['Compound'] == TARGET_COMPOUND]
    PestApp = PestApp_all[PestApp_all['Compound'] == TARGET_COMPOUND].reset_index(drop=True)

    if len(Pestpara) != 1:
        raise ValueError("Physicochemical_para must contain exactly one row for " + TARGET_COMPOUND)
    if PestApp.empty:
        raise ValueError("Application data not found for " + TARGET_COMPOUND)

    Pestrow = Pestpara.iloc[0]
    Pest = {'Type': Pestrow['Type'], 'inum': Pestrow['i'], 'Mol': Pestrow['M'],
            'Henry': Pestrow['H'],
            'Vap': Pestrow['P'], 'sol': Pestrow['sol_n'], 'pKa_acid': Pestrow['pKa,acid'],
            'pKa_base': Pestrow['pKa,base'],
            'lgKow': Pestrow['LogKOW,n'], 'znum': Pestrow['z'], 'Koc_n': Pestrow['Koc,n'],
            'kdeg_A': Pestrow['kdeg,A'],
            'kdeg_S': Pestrow['kdeg,S'], 'kdeg_W': Pestrow['kdeg,W'],
            'kdeg_Sed': Pestrow['kdeg,Sed']}
    Pest['Kaw'] = Pest['Vap'] / (Fixpara['R'] * Fixpara['T'] * Pest['sol'])
    Pest['P_An'] = 36 * (0.3 + 0.2 * Fixpara['v_wind']) * ((18 / Pest['Mol']) ** 0.335)
    Pest['P_W_A'] = 36 * (0.0004 + 0.00004 * (Fixpara['v_wind']) ** 2) * ((32 / Pest['Mol']) ** 0.25)

    # Input environmental parameters
    media = ['A', 'Ns', 'As', 'Us', 'W', 'Sed']
    Envpara_year = pd.read_excel('Input_Para_6.xlsx', sheet_name='Annual_para')
    Flowpara = pd.read_excel('Input_Para_6.xlsx', sheet_name='Confluence_Sequence')

    # Check that application rows match the annual parameter rows
    Annual_keys = Envpara_year[['Year', 'WR_ID']].reset_index(drop=True)
    App_keys = PestApp[['Year', 'WR_ID']].reset_index(drop=True)

    if not Annual_keys.equals(App_keys):
        raise ValueError("Year and WR_ID do not match for " + TARGET_COMPOUND)

    Seq = {}  # Reorder the simulation sequence of the river basin based on the confluence sequence of the rivers
    Flowdire = {}  # Establish a river confluence relationship, with each basin corresponding to several upstream basins

    # Read the number of spatial units, years and upstream slots from the input data
    n_su = Envpara_year['WR_ID'].nunique()
    simulation_years = Envpara_year['Year'].dropna().drop_duplicates().tolist()
    n_upstream = Flowpara.shape[1] - 4

    if Annual_keys.duplicated().any():
        raise ValueError("Year and WR_ID must be unique in Annual_para")
    if len(Flowpara) != n_su or Flowpara.iloc[:, 3].duplicated().any() or set(Flowpara.iloc[:, 3]) != set(Envpara_year['WR_ID']):
        raise ValueError("WR_ID must be unique and consistent in Annual_para and Confluence_Sequence")
    if not simulation_years:
        raise ValueError("No simulation year found in Annual_para")

    print("Spatial units：" + str(n_su))
    print("Simulation years：" + str(simulation_years))
    print("Upstream slots：" + str(n_upstream))

    for i in range(n_su):
        Seq[Flowpara.values[i, 3] - 1] = i
        upstream_values = pd.to_numeric(Flowpara.iloc[i, 4:], errors='coerce')
        Flowdire[Flowpara.values[i, 3]] = upstream_values.fillna(0).to_numpy(dtype=int)

    def append_sorted_data(df, data_dict):
        if not isinstance(data_dict, dict):
            print("Warning: Data must be dictionary type, no additional data appended")
            return df
        first_cols = [col for col in ['Year', 'WR_ID'] if col in data_dict]
        sorted_cols = first_cols + sorted(col for col in data_dict.keys() if col not in first_cols)
        if df.empty:
            new_row = pd.DataFrame([data_dict], columns=sorted_cols)
        else:
            new_row = pd.DataFrame([data_dict], columns=df.columns)
        return pd.concat([df, new_row], ignore_index=True)


    for yr_index, simulation_year in enumerate(simulation_years):
        Envpara_yr = Envpara_year[Envpara_year['Year'] == simulation_year].set_index('WR_ID')
        PestApp_yr = PestApp[PestApp['Year'] == simulation_year].set_index('WR_ID')

        if len(Envpara_yr) != n_su or len(PestApp_yr) != n_su or set(Envpara_yr.index) != set(Flowdire):
            raise ValueError("Incomplete spatial-unit data in year " + str(simulation_year))

        lgdata1 = pd.DataFrame()
        Bcondata1 = pd.DataFrame()
        Fluxflow = pd.DataFrame()

        for i in Seq.keys():
            WR_ID = i + 1
            Envyr = Envpara_yr.loc[WR_ID]
            Envrow = Envyr  # All environmental parameters now come from this year and WR_ID.
            App = PestApp_yr.loc[WR_ID]

            Area = {'A': Envyr['Area_A'], 'Ns': Envyr['Area_Ns'],
                    'As': Envyr['Area_As'], 'Us': Envyr['Area_Us'],
                    'W': Envyr['Area_W/Sed'], 'Sed': Envyr['Area_W/Sed']}
            Depth = {'A': 1000, 'Ns': 0.05, 'As': 0.2, 'Us': 0.2,
                     'W': Envrow['Depth_W'], 'Sed': 0.03}
            FraS = {'A': 2e-11, 'Ns': 0.6, 'As': 0.6, 'Us': 0.6,
                    'W': Envrow['FraS_W'], 'Sed': 0.2}
            FraW = {'A_cloud': 2e-11, 'A_aeros': 3e-7,
                    'Ns': Envyr['FraW_S'], 'As': Envyr['FraW_S'], 'Us': Envyr['FraW_S'],
                    'W': 1, 'Sed': 0.8}
            FraG = {'A': 1, 'Ns': Envyr['FraG_S'], 'As': Envyr['FraG_S'], 'Us': Envyr['FraG_S'],
                    'W': 0, 'Sed': 0}
            OC = {'A': 0.1, 'Ns': Envrow['OC_Ns'], 'As': Envrow['OC_As'], 'Us': Envrow['OC_Us'],
                  'W': 0.1, 'Sed': 0.05}
            pHW = {'A_cloud': 5.6, 'A_aeros': 3,
                   'Ns': Envrow['pHW_Ns'], 'As': Envrow['pHW_As'], 'Us': Envrow['pHW_Us'],
                   'W': 7, 'Sed': 7}
            QW = Envrow['QW']
            u_wd = Envyr['u_wd']
            ε_sur = {'Ns': Envrow['ε_sur_Ns/As'], 'As': Envrow['ε_sur_Ns/As'],
                     'Us': Envrow['ε_sur_Us']}
            ε_inf = {'Ns': Envrow['ε_inf_Ns/As'], 'As': Envrow['ε_inf_Ns/As'],
                     'Us': Envrow['ε_inf_Us']}
            u_eros = {'Ns': Envrow['u_eros_Ns/As'], 'As': Envrow['u_eros_Ns/As'],
                      'Us': Envrow['u_eros_Us']}

            #  Calculate the partition coefficient of the molecule
            def Kd_n(x):  # x represents the environmental medium，Kd_i = 0.1 * Kd_n
                return OC[x] * Pest['Koc_n'] * ρS[x]


            #  Calculate the dissociation ratio of molecules, based on its acidity
            if Pest['Type'] == 0:
                def φ_n(x):
                    return 1


                def φ_i(x):
                    return 0

            elif Pest['Type'] == 1:
                α = 1


                def φ_n(x):
                    return 1 / (1 + 10 ** (α * (pHW[x] - Pest['pKa_acid'])))


                def φ_i(x):
                    return 1 - φ_n(x)
            elif Pest['Type'] == -1:
                α = -1


                def φ_n(x):
                    return 1 / (1 + 10 ** (α * (pHW[x] - Pest['pKa_base'])))


                def φ_i(x):
                    return 1 - φ_n(x)
            else:
                def φ_n(x):
                    return 1 / (1 + 10 ** (pHW[x] - Pest['pKa_acid']) + 10 ** (Pest['pKa_base'] - pHW[x]))


                def φ_i(x):  # Amphoteric molecules are actually divided into anionic and cationic types, but NEOs have not been considered here for the time being
                    return φ_n(x) * (10 ** (pHW[x] - Pest['pKa_acid']) + 10 ** (Pest['pKa_base'] - pHW[x]))

            #  Calculate the activity coefficient
            if Pest['Type'] == 0:
                def γ_n(x):
                    return 10 ** (Fixpara['ks'] * IonStr[x])


                def γ_i(x):
                    return 1
            else:
                def γ_n(x):
                    return 10 ** (Fixpara['ks'] * IonStr[x])


                def γ_i(x):
                    return 10 ** (- Fixpara['Act'] * (Pest['znum'] ** 2) * (
                            IonStr[x] ** 0.5 / (1 + IonStr[x] ** 0.5) - 0.3 * IonStr[x]))

            # Calculate the activity capacity of each medium
            B = dict()
            B_X = dict()
            for j in media:
                if j == 'A':
                    B_X[j + '_G'] = FraG[j] * φ_n('A_cloud') * Pest['Kaw']
                    B_X[j + '_W'] = FraW['A_cloud'] * (φ_n('A_cloud') / γ_n(j) + φ_i('A_cloud') / γ_i(j)) + \
                                    FraW['A_aeros'] * (φ_n('A_aeros') / γ_n(j) + φ_i('A_aeros') / γ_i(j))
                    B_X[j + '_S'] = FraS[j] * (φ_n('A_aeros') * Kd_n(j) / γ_n(j) + φ_i('A_aeros') * 0.1 * Kd_n(j) / γ_i(j))

                else:
                    B_X[j + '_G'] = FraG[j] * φ_n(j) * Pest['Kaw']
                    B_X[j + '_W'] = FraW[j] * (φ_n(j) / γ_n(j) + φ_i(j) / γ_i(j))
                    B_X[j + '_S'] = FraS[j] * (φ_n(j) * Kd_n(j) / γ_n(j) + φ_i(j) * 0.1 * Kd_n(j) / γ_i(j))

                B[j] = B_X[j + '_G'] + B_X[j + '_W'] + B_X[j + '_S']

            B_X['rain'] = φ_n('A_cloud') / γ_n('A') + φ_i('A_cloud') / γ_i('A')

            # Diffusion process
            P = dict()
            P['WA'] = 1 / (φ_n('W') / Pest['P_W_A'] + 1 / (Pest['P_An'] * Pest['Kaw']))
            P['WSed'] = 1 / (1 / Fixpara['P_Sed_W'] + 1 / Fixpara['P_W_Sed'])
            Dif = dict()
            Dif['WA'] = P['WA'] * Area['W'] * φ_n('W')
            Dif['AW'] = P['WA'] * Area['W'] * φ_n('A_cloud')
            mediaSoil = media[1:4]
            for j in mediaSoil:
                P['A' + j] = 1 / (1 / (Fixpara['P_SoilW'] / φ_n(j) + Fixpara['P_SoilA_n'] * Pest['Kaw']) + 1 / (
                        Pest['P_An'] * Pest['Kaw']))
                Dif[j + 'A'] = P['A' + j] * Area[j] * φ_n(j)
                Dif['A' + j] = P['A' + j] * Area[j] * φ_n('A_cloud')
            Dif['SedW'] = P['WSed'] * Area['Sed']
            Dif['WSed'] = P['WSed'] * Area['Sed']

            # Advective flow
            medfromA = media[1:5]
            Trs = dict()
            Trs['out_W'] = QW * B['W']
            Trs['out_A'] = Area['A'] * Depth['A'] / (Fixpara['t'] * 24) * B['A']
            Volume = dict()
            Rct = dict()
            for j in media:
                Volume[j] = Area[j] * Depth[j]
                if j == 'A':
                    Rct[j] = B[j] * Volume[j] * Pest['kdeg_A']
                    for k in medfromA:
                        Trs['wd_' + j + k] = Area[k] * (Fixpara['ε_coll'] * (B_X['A_W'] + B_X['A_S']) + B_X['rain']) * u_wd
                        Trs['dd_' + j + k] = Area[k] * (
                                FraW['A_aeros'] * (φ_n('A_aeros') / γ_n('A') + φ_i('A_aeros') / γ_i('A')) + B_X['A_S']) * \
                                             Fixpara['v_dd']
                        Trs[j + k] = Trs['wd_' + j + k] + Trs['dd_' + j + k]

                elif mediaSoil.count(j) > 0:
                    Trs['sur_' + j + 'W'] = Area[j] * B_X[j + '_W'] / FraW[j] * ε_sur[j] * u_wd
                    Trs['inf_' + j] = Area[j] * B_X[j + '_W'] / FraW[j] * ε_inf[j] * u_wd
                    Trs['eros_' + j + 'W'] = Area[j] * B_X[j + '_S'] / FraS[j] * u_eros[j]
                    Trs[j + 'W'] = Trs['sur_' + j + 'W'] + Trs['eros_' + j + 'W']
                    Rct[j] = B[j] * Volume[j] * Pest['kdeg_S']

                elif j == 'W':
                    Trs['sedi_' + j + 'Sed'] = Area[j] * B_X[j + '_S'] * Fixpara['v_sedi']
                    Rct[j] = B[j] * Volume[j] * Pest['kdeg_W']

                else:
                    Trs['res_' + j + 'W'] = Area[j] * B_X[j + '_S'] * Fixpara['v_res']
                    Trs['buri'] = Area[j] * B[j] * Fixpara['v_buri']
                    Rct[j] = B[j] * Volume[j] * Pest['kdeg_Sed']

            m = 0
            Actmedia = dict()
            Nomedia = dict()  # Establish a dictionary of the media that need to be removed where the area of a certain medium is 0 and the equation has no solution.
            for k in Area:
                m = m + 1
                if Area[k] != 0:
                    Actmedia[k] = m
                else:
                    Nomedia[k] = m
            Nomelist1 = list(Nomedia.values())  # A list of serial numbers starting from 1
            Nomelist2 = [x - 1 for x in Nomelist1]  # A list of serial numbers starting from 0
            Blist = list(B.values())
            Barr = np.array(Blist)
            Barr = Barr.reshape(len(Blist), 1)

            n = len(media)
            K = np.zeros((n + 1, n + 1))
            E = np.zeros((n, 1))
            L = np.zeros((n, 1))
            G = np.zeros((n, 1))
            act = np.zeros((n, 1))
            np.set_printoptions(precision=2)

            #  Establish matrix row and column labels for all media
            row = 0
            col = 0
            l = 0
            for l in range(n + 1):
                K[row][0] = l
                row = row + 1
                K[0][col] = l
                col = col + 1

            K[2, 1] = Trs['ANs'] + Dif['ANs']
            K[3, 1] = Trs['AAs'] + Dif['AAs']
            K[4, 1] = Trs['AUs'] + Dif['AUs']
            K[5, 1] = Trs['AW'] + Dif['AW']

            K[1, 2] = Dif['NsA']
            K[1, 3] = Dif['AsA']
            K[1, 4] = Dif['UsA']
            K[1, 5] = Dif['WA']

            K[5, 2] = Trs['NsW']
            K[5, 3] = Trs['AsW']
            K[5, 4] = Trs['UsW']
            K[6, 5] = Trs['sedi_WSed'] + Dif['WSed']
            K[5, 6] = Trs['res_SedW'] + Dif['SedW']

            K[1, 1] = - sum(K[2:6, 1]) - Trs['out_A'] - Rct['A']
            K[2, 2] = - K[1, 2] - K[5, 2] - Trs['inf_Ns'] - Rct['Ns']
            K[3, 3] = - K[1, 3] - K[5, 3] - Trs['inf_As'] - Rct['As']
            K[4, 4] = - K[1, 4] - K[5, 4] - Trs['inf_Us'] - Rct['Us']
            K[5, 5] = - K[1, 5] - K[6, 5] - Trs['out_W'] - Rct['W']
            K[6, 6] = - K[5, 6] - Trs['buri'] - Rct['Sed']

            E[0, 0] = App['AppA']
            E[2, 0] = App['AppS_As']
            E[3, 0] = App['AppS_Us']
            E[4, 0] = App['AppW']

            if yr_index != 0:
                Bconrow = Bcondata2.loc[WR_ID]
                L[0, 0] = Bconrow['A'] * Area['A'] * Depth['A'] / 365 / 24
                L[1, 0] = Bconrow['Ns'] * Area['Ns'] * Depth['Ns'] / 365 / 24
                L[2, 0] = Bconrow['As'] * Area['As'] * Depth['As'] / 365 / 24
                L[3, 0] = Bconrow['Us'] * Area['Us'] * Depth['Us'] / 365 / 24
                L[4, 0] = Bconrow['W'] * Area['W'] * Depth['W'] / 365 / 24
                L[5, 0] = Bconrow['Sed'] * Area['Sed'] * Depth['Sed'] / 365 / 24
            else:
                pass

            # G[4, 0], sum: the flux flowing into the (upstream) river  mol/h
            upflow = np.array(Flowdire[i + 1])
            upflow = upflow.astype('int')
            x = 0
            while x < len(upflow):
                if upflow[x] == 0:
                    x = x + 1
                else:
                    try:
                        G[4, 0] += Fluxflow.loc[Seq[upflow[x] - 1], 'T_outW'] * 1000 / Pest['Mol'] / 24 / 365
                        x = x + 1
                    except:
                        print(i, 'Convergence error')
                        print(Fluxflow[['WR_ID', 'T_outW']], '\n')

            #  Delete the virtual medium and tags
            K1 = np.delete(K, Nomelist1, axis=0)
            K1 = np.delete(K1, Nomelist1, axis=1)
            KK = np.delete(K1, 0, axis=0)
            KK = np.delete(KK, 0, axis=1)
            EE = np.delete(E, Nomelist2, axis=0)
            LL = np.delete(L, Nomelist2, axis=0)
            GG = np.delete(G, Nomelist2, axis=0)
            act = np.delete(G, Nomelist2, axis=0)
            BB = np.delete(Barr, Nomelist2, axis=0)

            # Solve the matrix equation
            try:
                Kinv = np.linalg.inv(KK)
            except:
                print('There is no inverse matrix, which might be because the area of a certain medium is 0')
            In = EE + LL + GG
            act = np.matmul(- Kinv, In)  # mol·m-3

            #  Calculate the concentrations of the main compartments and the subcompartments
            con = act * BB * Pest['Mol']
            con_X = dict()  # g·m-3
            k = 0
            for j in media:
                if j in list(Actmedia.keys()):
                    if j == 'A':
                        con_X[j + '_G'] = act[k][0] * B_X[j + '_G'] / FraG[j] * Pest['Mol']
                        con_X[j + '_W'] = act[k][0] * B_X[j + '_W'] / (FraW['A_aeros'] + FraW['A_cloud']) * Pest['Mol']
                        con_X[j + '_S'] = act[k][0] * B_X[j + '_S'] / FraS[j] * Pest['Mol']
                    elif (j == 'W') or (j == 'Sed'):
                        con_X[j + '_G'] = 0
                        con_X[j + '_W'] = act[k][0] * B_X[j + '_W'] / FraW[j] * Pest['Mol']
                        con_X[j + '_S'] = act[k][0] * B_X[j + '_S'] / FraS[j] * Pest['Mol']
                    else:
                        con_X[j + '_G'] = act[k][0] * B_X[j + '_G'] / FraG[j] * Pest['Mol']
                        con_X[j + '_W'] = act[k][0] * B_X[j + '_W'] / FraW[j] * Pest['Mol']
                        con_X[j + '_S'] = act[k][0] * B_X[j + '_S'] / FraS[j] * Pest['Mol']
                    k = k + 1
                else:
                    con_X[j + '_G'] = 0
                    con_X[j + '_W'] = 0
                    con_X[j + '_S'] = 0

            #  Add all the media that were not involved in the matrix equation before to form a complete result
            #  Result output: concentration and mass
            allact = dict()  # mol·m-3
            allcon = dict()  # g·m-3
            k = 0
            for j in media:
                if j in list(Actmedia.keys()):
                    allact[j] = act[k][0]
                    allcon[j] = con[k][0]
                    k = k + 1
                else:
                    allact[j] = 0
                    allcon[j] = 0

            mass_X = dict()  # kg
            for j in media:
                mass_X[j + '_G'] = con_X[j + '_G'] * Area[j] * Depth[j] * FraG[j] / 1000
                mass_X[j + '_S'] = con_X[j + '_S'] * Area[j] * Depth[j] * FraS[j] / 1000
                if j == 'A':
                    mass_X[j + '_W'] = con_X[j + '_W'] * Area[j] * Depth[j] * (FraW['A_aeros'] + FraW['A_cloud']) / 1000
                else:
                    mass_X[j + '_W'] = con_X[j + '_W'] * Area[j] * Depth[j] * FraW[j] / 1000

            allmass = {key: allcon[key] * Area[key] * Depth[key] / 1000 for key in Area}

            #  Result output: transport and transform fluxes
            Flux = dict()  #  mol/h
            Flux['D_WA'] = Dif['WA'] * allact['W']
            Flux['D_AW'] = Dif['AW'] * allact['A']
            Flux['D_WSed'] = Dif['WSed'] * allact['W']
            Flux['D_SedW'] = Dif['SedW'] * allact['Sed']
            for j in medfromA:
                if j == 'W':
                    Flux['T_wd_A' + j] = Trs['wd_AW'] * allact['A']
                    Flux['T_dd_A' + j] = Trs['dd_AW'] * allact['A']
                    Flux['T_sedi_' + j + 'Sed'] = Trs['sedi_WSed'] * allact[j]
                    Flux['R_' + j] = Rct[j] * allact[j]

                else:
                    Flux['D_A' + j] = Dif['A' + j] * allact['A']
                    Flux['D_' + j + 'A'] = Dif[j + 'A'] * allact[j]
                    Flux['T_wd_A' + j] = Trs['wd_A' + j] * allact['A']
                    Flux['T_dd_A' + j] = Trs['dd_A' + j] * allact['A']
                    Flux['T_sur_' + j + 'W'] = Trs['sur_' + j + 'W'] * allact[j]
                    Flux['T_inf_' + j] = Trs['inf_' + j] * allact[j]
                    Flux['T_eros_' + j + 'W'] = Trs['eros_' + j + 'W'] * allact[j]
                    Flux['R_' + j] = Rct[j] * allact[j]

            Flux['T_res_SedW'] = Trs['res_SedW'] * allact['Sed']
            Flux['T_buri'] = Trs['buri'] * allact['Sed']

            Flux['T_outA'] = Trs['out_A'] * allact['A']
            Flux['T_outW'] = Trs['out_W'] * allact['W']
            Flux['T_inW'] = G[4, 0]
            Flux['R_A'] = Rct['A'] * allact['A']
            Flux['R_Sed'] = Rct['Sed'] * allact['Sed']

            for key, value in Flux.items():  # kg/yr
                new_value = value * Pest['Mol'] / 1000 * 24 * 365
                Flux[key] = new_value

            #   The cumulative amount and the calculation of the concentration of that year as the background concentration of the following year
            Lg = dict()
            Bcon = dict()   # mol/m3
            for key, value in allmass.items():  # mol/h
                new_value = value * 1000 / Pest['Mol'] / 365 / 24
                Lg[key] = new_value

            for key, value in allcon.items():
                new_value = value / Pest['Mol']
                Bcon[key] = new_value
            Bcon['WR_ID'] = WR_ID

            lgdata1 = append_sorted_data(lgdata1, Lg)
            Bcondata1 = append_sorted_data(Bcondata1, Bcon)

            #  Add the year and river basin information to the output result
            allcon['WR_ID'] = WR_ID
            allcon['Year'] = simulation_year
            con_X['WR_ID'] = WR_ID
            con_X['Year'] = simulation_year
            allmass['WR_ID'] = WR_ID
            allmass['Year'] = simulation_year
            mass_X['WR_ID'] = WR_ID
            mass_X['Year'] = simulation_year
            Flux['WR_ID'] = WR_ID
            Flux['Year'] = simulation_year

            Fluxlg = dict()
            if yr_index != 0:
                Fluxlg['A'] = L[0, 0]
                Fluxlg['Ns'] = L[1, 0]
                Fluxlg['As'] = L[2, 0]
                Fluxlg['Us'] = L[3, 0]
                Fluxlg['W'] = L[4, 0]
                Fluxlg['Sed'] = L[5, 0]

                for key, value in Fluxlg.items():  # kg/yr
                    new_value = value * Pest['Mol'] / 1000 * 24 * 365
                    Fluxlg[key] = new_value
            else:
                Fluxlg['A'] = 0
                Fluxlg['Ns'] = 0
                Fluxlg['As'] = 0
                Fluxlg['Us'] = 0
                Fluxlg['W'] = 0
                Fluxlg['Sed'] = 0

            Fluxlg['WR_ID'] = WR_ID
            Fluxlg['Year'] = simulation_year

            #  write all results
            condata = append_sorted_data(condata, allcon)
            con_Xdata = append_sorted_data(con_Xdata, con_X)
            massdata = append_sorted_data(massdata, allmass)
            mass_Xdata = append_sorted_data(mass_Xdata, mass_X)
            Fluxdata = append_sorted_data(Fluxdata, Flux)
            Fluxflow = append_sorted_data(Fluxflow, Flux)
            Fluxlgdata = append_sorted_data(Fluxlgdata, Fluxlg)

        lgdata2 = pd.DataFrame()
        lgdata2 = lgdata1
        Bcondata2 = Bcondata1.set_index('WR_ID')

        print(str(simulation_year) + ": Completed")

    # Add the compound name to every output table
    for result_data in (condata, con_Xdata, massdata, mass_Xdata, Fluxdata, Fluxlgdata):
        result_data.insert(0, 'Compound', TARGET_COMPOUND)

    return condata, con_Xdata, massdata, mass_Xdata, Fluxdata, Fluxlgdata


# Read the compound list from Physicochemical_para and simulate all compounds
Pestpara_list = pd.read_excel('Input_Para_6.xlsx', sheet_name='Physicochemical_para')
TARGET_COMPOUNDS = Pestpara_list['Compound'].dropna().drop_duplicates().tolist()

if not TARGET_COMPOUNDS:
    raise ValueError("No compound found in Physicochemical_para")

all_results = []
for compound in TARGET_COMPOUNDS:
    all_results.append(run_compound(compound))

condata = pd.concat([result[0] for result in all_results], ignore_index=True)
con_Xdata = pd.concat([result[1] for result in all_results], ignore_index=True)
massdata = pd.concat([result[2] for result in all_results], ignore_index=True)
mass_Xdata = pd.concat([result[3] for result in all_results], ignore_index=True)
Fluxdata = pd.concat([result[4] for result in all_results], ignore_index=True)
Fluxlgdata = pd.concat([result[5] for result in all_results], ignore_index=True)

with pd.ExcelWriter('Env_results_6.xlsx', mode='w', engine='openpyxl') as book:
    condata.to_excel(book, sheet_name="Concentr_g·m-3", index=False)
    con_Xdata.to_excel(book, sheet_name="Sub_Concentr_g·m-3", index=False)
    massdata.to_excel(book, sheet_name="Mass_kg", index=False)
    mass_Xdata.to_excel(book, sheet_name="Sub_Masskg", index=False)
    Fluxdata.to_excel(book, sheet_name="Flux_kg·yr-1", index=False)
    Fluxlgdata.to_excel(book, sheet_name="Legacy_kg·yr-1", index=False)
