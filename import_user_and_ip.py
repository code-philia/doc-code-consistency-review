import pandas as pd
from sqlalchemy import create_engine


def import_user(user_pwd_file, ip_file):
    user_columns = ['id', 'name', 'username', 'password']
    ip_columns = ['id', 'name', 'ip']

    df_users = pd.read_excel(user_pwd_file, header=None, names=user_columns)
    df_ips = pd.read_excel(ip_file, header=None, names=ip_columns)
    df_merged = pd.merge(df_users, df_ips[['name', 'ip']], on='name', how='left')
    df_merged['role'] = ''
    df_merged = df_merged.rename(columns={'id': 'user_id'})
    df_final = df_merged[['user_id', 'name', 'username', 'password', 'ip', 'role']]
    # print(df_final.head())
    conn = create_engine('mysql+pymysql://root:123456@localhost:3306/doc_code?charset=utf8mb4')
    df_final.to_sql('user', conn, if_exists='replace', index=False)


# 运行之后会覆盖原来的数据!!!
if __name__ == '__main__':
    user_pwd_file = './templates/用户密码表.xlsx'
    ip_file = './templates/IP对应表.xlsx'
    # db_file = 'doc_code_sql.db'
    import_user(user_pwd_file, ip_file)
