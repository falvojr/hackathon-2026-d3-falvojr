"""Monta o GIF de demonstração, com legenda por passo, a partir dos quadros da demonstração fictícia.

Uso:
  node kit/demo/capturar.js evidencias/prints/quadros
  python kit/montar-gif.py evidencias/prints/quadros evidencias/prints/assistente-horas-demo.gif
Os quadros esperados (PNG) são os listados em PASSOS, na ordem.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

LARGURA, ALTURA = 1280, 860
FAIXA = 96
FUNDO = (236, 240, 244)
AZUL = (29, 52, 70)
DESTAQUE = (31, 111, 209)
FONTES = Path("C:/Windows/Fonts")
RODAPE = "Hackathon Ideen 2026 · Desafio 3 · v1.2.0 · dados fictícios"


def fonte(nome, tamanho):
    for candidato in (FONTES / nome, Path(nome)):
        try:
            return ImageFont.truetype(str(candidato), tamanho)
        except OSError:
            continue
    return ImageFont.load_default()


TITULO = fonte("segoeuib.ttf", 32)
TEXTO = fonte("segoeui.ttf", 28)
PEQUENO = fonte("segoeui.ttf", 18)

# (arquivo do quadro, legenda, segundos na tela)
PASSOS = [
    ("painel.png", "Na tela de Horas do PSOffice, um painel mostra a semana dia a dia", 5),
    ("evidencias.png", "Dia sem horas: sugere horas e links do Jira dos seus commits e PRs", 5),
    ("ajustar.png", "Fora do expediente vira hora extra; Ajustar soma no dia lançado", 5),
    ("revisar.png", "Revisar sugestões: veja o antes → depois e grave só o que marcar", 5.5),
    ("recolhido.png", "Recolhido, o painel vira uma linha com o resumo da semana", 4.5),
    ("opcoes.png", "Opções: cada regra numa frase, com o valor editável dentro dela", 5),
    ("opcoes-avancado.png", "Avançado (opcional): atividade, feriados locais e Jira", 4.5),
]


def cartao(titulo, linhas):
    img = Image.new("RGB", (LARGURA, ALTURA), AZUL)
    d = ImageDraw.Draw(img)
    d.text((80, 230), titulo, font=fonte("segoeuib.ttf", 52), fill="white")
    y = 330
    for linha in linhas:
        d.text((80, y), linha, font=TEXTO, fill=(214, 226, 238))
        y += 52
    d.text((80, ALTURA - 60), RODAPE, font=PEQUENO, fill=(150, 170, 190))
    return img


def quadro(caminho, legenda, n, total):
    img = Image.new("RGB", (LARGURA, ALTURA), FUNDO)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, LARGURA, FAIXA], fill=AZUL)
    d.ellipse([28, 24, 76, 72], fill=DESTAQUE)
    d.text((52, 48), str(n), font=TITULO, fill="white", anchor="mm")
    d.text((96, 48), legenda, font=TITULO, fill="white", anchor="lm")
    d.text((LARGURA - 24, ALTURA - 14), f"{n}/{total} · dados fictícios", font=PEQUENO, fill=(120, 130, 140), anchor="rs")

    print_ = Image.open(caminho).convert("RGB")
    area_l, area_a = LARGURA - 80, ALTURA - FAIXA - 70
    escala = min(area_l / print_.width, area_a / print_.height)
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
        "Sem PSOffice? Abra kit/demo/painel.html no navegador.",
    ]))
    duracoes.append(5)

    paleta = [q.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for q in quadros]
    paleta[0].save(saida, save_all=True, append_images=paleta[1:], duration=[int(s * 1000) for s in duracoes], loop=0, optimize=True)
    print(f"{saida}: {len(quadros)} quadros, {sum(duracoes):.0f}s, {Path(saida).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
