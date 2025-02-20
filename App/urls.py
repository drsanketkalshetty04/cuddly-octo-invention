from django.contrib import admin
from django.urls import path,include

from App import views

urlpatterns = [
    # path("admin", views.admin , name="admin"),
    # path("user", views.user, name="user"),
    # path('index', views.index, name='index'),
    path('JanSave260309', views.Jan_Save, name="JanSave260309"),
    path("FebSave260309", views.Feb_Save, name="FebSave260309"),
    path("MarSave260309", views.Mar_Save, name="MarSave260309"),
    path("ApiSave260309", views.Api_Save, name="ApiSave260309"),
    path("MaySave260309", views.May_Save, name="MaySave260309"),
    path("JunSave260309", views.Jun_Save, name="JunSave260309"),
    path("JulSave260309", views.Jul_Save, name="JulSave260309"),
    path("AugSave260309", views.Aug_Save, name="AugSave260309"),
    path("SepSave260309", views.Sep_Save, name="SepSave260309"),
    path("OctSave260309", views.Oct_Save, name="OctSave260309"),
    path("NovSave260309", views.Nov_Save, name="NovSave260309"),
    path("DecSave260309", views.Dec_Save, name="DecSave260309"),
    path("jet", include('jet.urls', 'jet')),
    path("", admin.site.urls),
]