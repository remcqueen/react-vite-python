import os

# This file combines all the code files in the repository into a single file for easy use with LLMs
def is_valid_file(file, root):
    return (
        file.endswith(('.js', '.jsx', '.ts', '.tsx', 'package.json',
                      '.css', '.scss', '.py', '.html', '.rs', 'Cargo.toml', '.sh', 'tsconfig.json'))
        and file != "promptify.py"
        and not (os.path.abspath(root) == os.path.abspath(src_folder) and file == "api.ts")
    )


def generate_combined_code(input_folder, src_folder, output_file_path, ignore_folders):
    with open(output_file_path, "w", encoding="utf-8") as combined_file:
        for root, _, files in os.walk(input_folder):
            if any(ignore_folder in root for ignore_folder in ignore_folders):
                continue
            if root != input_folder and root != src_folder and not root.startswith(os.path.join(src_folder, '')):
                continue
            for file in files:
                if is_valid_file(file, root):
                    file_path = os.path.join(root, file)
                    with open(file_path, "r", encoding="utf-8") as individual_file:
                        code = individual_file.read()
                        combined_file.write(
                            f"{file_path}\n```\n{code}\n```\n\n")


if __name__ == "__main__":
    input_folder = "./"
    src_folder = "./src"  # Change this to the src directory path
    output_file_path = "combined_code.txt"
    # Add the names of the folders you want to ignore here
    ignore_folders = ['dist', 'node_modules', '.github', ]
    generate_combined_code(input_folder, src_folder,
                           output_file_path, ignore_folders)
