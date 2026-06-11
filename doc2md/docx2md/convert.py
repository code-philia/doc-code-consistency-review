import os

from .converter import Converter
from .docxfile import DocxFile
from .docxmedia import DocxMedia

def do_convert(docx_file: str, parseDocMethod: str, target_dir="", use_md_table=False, savedMdName="")  -> str:
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
        try:
            styles_xml = docx.styles()
        except Exception:
            styles_xml = None

        try:
            numbering_xml = docx.numbering()
        except Exception:
            numbering_xml = None

        converter = Converter(docx.document(), styles_xml, numbering_xml, media, use_md_table, parseDocMethod)
        path = os.path.join(target_dir,savedMdName)
        try:
            with open(path, 'w', encoding='utf-8') as md_file:
                md_file.write(converter.convert())
        except:
            with open(savedMdName, 'w', encoding='utf-8') as md_file: # 改了这里
                md_file.write(converter.convert())
        return converter.convert()
    except Exception as e:
        return f"Exception: {e}"
