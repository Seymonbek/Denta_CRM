"""Seed standard dental ICD-10 diagnoses (SSV / JSST XKT-10)."""
from __future__ import annotations

from django.core.management.base import BaseCommand
from apps.treatments.models import ICD10Diagnosis

DENTAL_ICD10_DATA = [
    {
        "code": "K02.0",
        "name_uz": "Emal kariesi (boshlang'ich karies / oq dog' bosqichi)",
        "name_ru": "Кариес эмали (стадия белого пятна)",
        "category": "Karies",
        "is_common": True,
    },
    {
        "code": "K02.1",
        "name_uz": "Dentin kariesi (o'rta va chuqur karies)",
        "name_ru": "Кариес дентина (средний и глубокий кариес)",
        "category": "Karies",
        "is_common": True,
    },
    {
        "code": "K02.2",
        "name_uz": "Tish sementi kariesi (ildiz kariesi)",
        "name_ru": "Кариес цемента (кариес корня)",
        "category": "Karies",
        "is_common": True,
    },
    {
        "code": "K02.3",
        "name_uz": "To'xtagan tish kariesi",
        "name_ru": "Приостановившийся кариес зубов",
        "category": "Karies",
        "is_common": False,
    },
    {
        "code": "K03.0",
        "name_uz": "Tishlarning patologik yemirilishi (abraziv yeyilish)",
        "name_ru": "Повышенное стирание зубов",
        "category": "Nokarioz zararlanishlar",
        "is_common": False,
    },
    {
        "code": "K03.1",
        "name_uz": "Ponasimon nuqson (eroziya)",
        "name_ru": "Клиновидный дефект",
        "category": "Nokarioz zararlanishlar",
        "is_common": True,
    },
    {
        "code": "K03.8",
        "name_uz": "Tishlar giperesteziyasi (sezuvchanlik oshishi)",
        "name_ru": "Гиперестезия дентина",
        "category": "Nokarioz zararlanishlar",
        "is_common": True,
    },
    {
        "code": "K04.0",
        "name_uz": "Pulpit (o'tkir, surunkali, qaytalanuvchi)",
        "name_ru": "Пульпит (острый, хронический)",
        "category": "Pulpit va Periodontit",
        "is_common": True,
    },
    {
        "code": "K04.1",
        "name_uz": "Pulpa nekrozi (gangrena)",
        "name_ru": "Некроз пульпы",
        "category": "Pulpit va Periodontit",
        "is_common": True,
    },
    {
        "code": "K04.4",
        "name_uz": "O'tkir apikal periodontit",
        "name_ru": "Острый апикальный периодонтит",
        "category": "Pulpit va Periodontit",
        "is_common": True,
    },
    {
        "code": "K04.5",
        "name_uz": "Surunkali apikal periodontit (granulema)",
        "name_ru": "Хронический апикальный периодонтит",
        "category": "Pulpit va Periodontit",
        "is_common": True,
    },
    {
        "code": "K04.7",
        "name_uz": "Periapikal abssess (fistulasiz)",
        "name_ru": "Периапикальный абсцесс без свища",
        "category": "Pulpit va Periodontit",
        "is_common": True,
    },
    {
        "code": "K05.0",
        "name_uz": "O'tkir gingivit",
        "name_ru": "Острый гингивит",
        "category": "Parodont kasalliklari",
        "is_common": False,
    },
    {
        "code": "K05.1",
        "name_uz": "Surunkali kataral / gipertrofik gingivit",
        "name_ru": "Хронический гингивит",
        "category": "Parodont kasalliklari",
        "is_common": True,
    },
    {
        "code": "K05.3",
        "name_uz": "Surunkali parodontit (yengil, o'rta, og'ir)",
        "name_ru": "Хронический пародонтит",
        "category": "Parodont kasalliklari",
        "is_common": True,
    },
    {
        "code": "K07.2",
        "name_uz": "Tish qatori anomaliyalari va prikus buzilishi",
        "name_ru": "Аномалии прикуса и зубных рядов",
        "category": "Ortodontiya",
        "is_common": True,
    },
    {
        "code": "K08.1",
        "name_uz": "Baxtsiz hodisa, chiqarish yoki parodont tufayli tishlar yo'qolishi (adentiya)",
        "name_ru": "Потеря зубов вследствие несчастного случая, удаления или локальной болезни пародонта",
        "category": "Ortopediya / Implantatsiya",
        "is_common": True,
    },
]


class Command(BaseCommand):
    help = "Seed standard dental ICD-10 diagnoses"

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0
        for item in DENTAL_ICD10_DATA:
            obj, created = ICD10Diagnosis.objects.update_or_create(
                code=item["code"],
                defaults={
                    "name_uz": item["name_uz"],
                    "name_ru": item["name_ru"],
                    "category": item["category"],
                    "is_common": item["is_common"],
                    "is_active": True,
                },
            )
            if created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"ICD-10 katalogi yangilandi: {created_count} ta yangi, {updated_count} ta yangilandi."
            )
        )
