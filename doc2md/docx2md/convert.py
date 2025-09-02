import os

from .converter import Converter
from .docxfile import DocxFile
from .docxmedia import DocxMedia

def do_convert(docx_file: str, target_dir="", use_md_table=False,savedMdName="")  -> str:
    """
    convert docx_file to Markdown text and return it
    
    Args:
        docx_file(str): a file to parse
        target_dir(str): save images into target_dir/media/ if specified
        use_md_table(bool): use Markdown table notation instead of HTHML
    Returns:
        Markdown text(str)
    """
    try:
        docx = DocxFile(docx_file)
        media = DocxMedia(docx)
        if target_dir:
            media.save(target_dir)
        converter = Converter(docx.document(), media, use_md_table)
        path = os.path.join(target_dir,savedMdName)
        with open(path, 'w', encoding='utf-8') as md_file:
            md_file.write(converter.convert())
        return converter.convert()
    except Exception as e:
        return f"Exception: {e}"
