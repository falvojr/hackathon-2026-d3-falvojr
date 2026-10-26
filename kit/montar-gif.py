"""Monta o GIF de demonstração com legenda por passo a partir de prints já mascarados.

Uso: python kit/montar-gif.py <pasta-com-os-quadros> evidencias/prints/assistente-horas-demo.gif
Os quadros esperados (PNG/JPG) são os listados em PASSOS, na ordem.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

LARGURA, ALTURA = 1280, 720
FAIXA = 96
FUNDO = (236, 240, 244)
AZUL = (29, 52, 70)
DESTAQUE = (31, 111, 209)
FONTES = Path("C:/Windows/Fonts")


def fonte(nome, tamanho):
    for candidato in (FONTES / nome, Path(nome)):
        try:
            return ImageFont.truetype(str(candidato), tamanho)
        except OSError:
            continue
    return ImageFont.load_default()


TITULO = fonte("segoeuib.ttf", 34)
TEXTO = fonte("segoeui.ttf", 26)
PEQUENO = fonte("segoeui.ttf", 18)

# (arquivo do quadro, legenda, segundos na tela)
PASSOS = [
    ("painel.png", "O painel aparece em cima da grade de Horas do PSOffice", 4.5),
    ("evidencias.png", "Cada dia mostra o que foi feito: PRs, commits e chaves do Jira", 4.5),
    ("hora-extra.png", "Atividade fora do expediente vira aviso de possível hora extra", 4.5),
    ("revisar.png", "Revisar sugestões: veja o antes → depois e grave só o que marcar", 5),
    ("hoje.png", "Semana atual: hoje sem atividade ainda não conta como ausência", 4.5),
    ("cancelar-envio.png", "Semana enviada e não aprovada: dá para cancelar o envio e ajustar", 4.5),
]


def cartao(titulo, linhas):
    img = Image.new("RGB", (LARGURA, ALTURA), AZUL)
    d = ImageDraw.Draw(img)
    d.text((80, 170), titulo, font=fonte("segoeuib.ttf", 52), fill="white")
    y = 270
    for linha in linhas:
        d.text((80, y), linha, font=TEXTO, fill=(214, 226, 238))
        y += 50
    d.text((80, ALTURA - 60), "Hackathon Ideen 2026 · Desafio 3 · dados mascarados", font=PEQUENO, fill=(150, 170, 190))
    return img


def quadro(caminho, legenda, n, total):
    img = Image.new("RGB", (LARGURA, ALTURA), FUNDO)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, LARGURA, FAIXA], fill=AZUL)
    d.ellipse([28, 24, 76, 72], fill=DESTAQUE)
    d.text((52, 48), str(n), font=TITULO, fill="white", anchor="mm")
    d.text((96, 48), legenda, font=TITULO, fill="white", anchor="lm")
    d.text((LARGURA - 24, ALTURA - 14), f"{n}/{total} · dados mascarados", font=PEQUENO, fill=(120, 130, 140), anchor="rs")

    print_ = Image.open(caminho).convert("RGB")
    area_l, area_a = LARGURA - 80, ALTURA - FAIXA - 70
    escala = min(area_l / print_.width, area_a / print_.height, 1.6)
    print_ = print_.resize((int(print_.width * escala), int(print_.height * escala)), Image.LANCZOS)
    x = (LARGURA - print_.width) // 2
    y = FAIXA + 25 + (area_a - print_.height) // 2
    d.rectangle([x - 2, y - 2, x + print_.width + 1, y + print_.height + 1], outline=(190, 200, 210), width=2)
    img.paste(print_, (x, y))
    return img


def main(pasta, saida):
    pasta = Path(pasta)
    quadros = [
        cartao("Assistente de Horas PSOffice", [
            "Lembra, sugere e preenche o apontamento de horas",
            "a partir da sua atividade no GitHub,",
            "direto na tela de Horas do PSOffice.",
        ])
    ]
    duracoes = [3.5]
    for i, (arquivo, legenda, seg) in enumerate(PASSOS, 1):
        quadros.append(quadro(pasta / arquivo, legenda, i, len(PASSOS)))
        duracoes.append(seg)
    quadros.append(cartao("Para usar", [
        "1. node extensao/ponte/instalar.js --usuario <conta-do-gh>",
        "2. Carregar a pasta extensao/ no Chrome ou Edge",
        "3. Abrir Horas no PSOffice",
    ]))
    duracoes.append(4)

    paleta = [q.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for q in quadros]
    paleta[0].save(saida, save_all=True, append_images=paleta[1:], duration=[int(s * 1000) for s in duracoes], loop=0, optimize=True)
    print(f"{saida}: {len(quadros)} quadros, {sum(duracoes):.0f}s, {Path(saida).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
