import os
import sys

def list_files_with_content(directory):
    """
    指定されたディレクトリ内のすべてのファイルとその内容を再帰的に表示する
    
    Args:
        directory (str): 探索するディレクトリのパス
    """
    # ディレクトリが存在するか確認
    if not os.path.exists(directory):
        print(f"エラー: ディレクトリ '{directory}' が見つかりません。")
        return
    
    # ディレクトリ内のすべてのファイルとフォルダを取得
    for root, dirs, files in os.walk(directory):
        for file in files:
            file_path = os.path.join(root, file)
            # 相対パスに変換（必要に応じて）
            rel_path = os.path.relpath(file_path, directory)
            # スラッシュ形式のパスに統一
            display_path = '/' + rel_path.replace('\\', '/')
            
            print(display_path)
            
            # ファイルの内容を読み取る
            try:
                # バイナリファイルやサイズの大きなファイルを避けるための簡易チェック
                if os.path.getsize(file_path) > 1024 * 1024:  # 1MB以上のファイルはスキップ
                    print("    (ファイルサイズが大きすぎるため表示をスキップします)")
                    continue
                
                # テキストファイルとして読み取り
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # インデントを付けて内容を表示
                    indented_content = '\n'.join(f'    {line}' for line in content.splitlines())
                    print(indented_content)
                    print()  # 空行を挿入して見やすくする
            except UnicodeDecodeError:
                print("    (バイナリファイルまたは非テキストファイルのため表示できません)")
                print()
            except Exception as e:
                print(f"    (ファイル読み取りエラー: {str(e)})")
                print()

if __name__ == "__main__":
    # コマンドライン引数からディレクトリを取得、指定がなければカレントディレクトリを使用
    directory = sys.argv[1] if len(sys.argv) > 1 else '.'
    list_files_with_content(directory)