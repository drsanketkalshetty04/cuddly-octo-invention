# import pandas as pd
# from App.models import January, February, March, April, May, June, July, August, September, October, November, December
#
#
#
# def January_():
#     # Retrieve all objects from the model
#     JanData = January.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     jandata= {
#         "A-Members": [],
#         "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#         "J-Last Month Shears": [],
#     }
#
#     for D in JanData:
#         jandata["A-Members"].append(D.firstname)
#         jandata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         jandata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         jandata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         jandata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         jandata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         jandata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         jandata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         jandata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         obj = February.objects.get(firstname=D.firstname)
#         obj.Last_month_shears = int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         obj.save()
#         jandata["J-Last Month Shears"].append(D.Last_month_shears)
#
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(jandata)
#     sf = df.to_csv("App/Saved/January.csv", index=False)
#
#     context = {'table': df.to_html(index=False)}
#
#     return context,sf
#
# def February_():
#     # Retrieve all objects from the model
#     FebData = February.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     febdata = {
#         "A-Members": [],
#         "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#         "J-Last Month Shears": [],
#     }
#
#     for D in FebData:
#         febdata["A-Members"].append(D.firstname)
#         febdata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         febdata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         febdata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         febdata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         febdata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         febdata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         febdata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         febdata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         obj = March.objects.get(firstname=D.firstname)
#         obj.Last_month_shears = int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         obj.save()
#         febdata["J-Last Month Shears"].append(D.Last_month_shears)
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(febdata)
#     sf = df.to_csv("App/Saved/February.csv", index=False)
#     return sf, febdata
#
# def Marche_():
#     # Retrieve all objects from the model
#     MarData = March.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     mardata = {
#         "A-Members": [],
#         "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#         "J-Last Month Shears": [],
#     }
#
#     for D in MarData:
#         mardata["A-Members"].append(D.firstname)
#         mardata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         mardata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         mardata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         mardata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         mardata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         mardata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         mardata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         mardata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         obj = April.objects.get(firstname=D.firstname)
#         obj.Last_month_shears = int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         obj.save()
#         mardata["J-Last Month Shears"].append(D.Last_month_shears)
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(mardata)
#     sf = df.to_csv('App/Saved/March.csv', index=False)
#     return sf, mardata
#
# def April_():
#     # Retrieve all objects from the model
#     ApiData = April.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     apidata = {
#         "A-Members": [],
#         "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#         "J-Last Month Shears": [],
#     }
#
#     for D in ApiData:
#         apidata["A-Members"].append(D.firstname)
#         apidata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         apidata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         apidata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         apidata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         apidata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         apidata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         apidata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         apidata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         obj = May.objects.get(firstname=D.firstname)
#         obj.Last_month_shears = int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         obj.save()
#         apidata["J-Last Month Shears"].append(D.Last_month_shears)
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(apidata)
#     sf = df.to_csv("App/Saved/April.csv", index=False)
#     return sf, apidata
#
# def May_():
#     # Retrieve all objects from the model
#     MayData = May.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     maydata = {
#         "A-Members": [],
#        "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#        "J-Last Month Shears": [],
#     }
#
#     for D in MayData:
#         maydata["A-Members"].append(D.firstname)
#         maydata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         maydata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         maydata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         maydata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         maydata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         maydata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         maydata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         maydata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         obj = June.objects.get(firstname=D.firstname)
#         obj.Last_month_shears = int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         obj.save()
#         maydata["J-Last Month Shears"].append(D.Last_month_shears)
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(maydata)
#     sf = df.to_csv("App/Saved/May.csv", index=False)
#     return sf, maydata
#
# def June_():
#     # Retrieve all objects from the model
#     JunData = June.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     jundata = {
#         "A-Members": [],
#         "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#         "J-Last Month Shears": [],
#     }
#
#     for D in JunData:
#         jundata["A-Members"].append(D.firstname)
#         jundata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         jundata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         jundata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         jundata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         jundata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         jundata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         jundata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         jundata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         obj = July.objects.get(firstname=D.firstname)
#         obj.Last_month_shears = int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         obj.save()
#         jundata["J-Last Month Shears"].append(D.Last_month_shears)
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(jundata)
#     sf = df.to_csv("App/Saved/June.csv", index=False)
#     return sf, jundata
#
# def July_():
#     # Retrieve all objects from the model
#     JulyData = July.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     julydata = {
#         "A-Members": [],
#         "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#         "J-Last Month Shears": [],
#     }
#
#     for D in JulyData:
#         julydata["A-Members"].append(D.firstname)
#         julydata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         julydata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         julydata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         julydata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         julydata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         julydata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         julydata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         julydata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         obj = August.objects.get(firstname=D.firstname)
#         obj.Last_month_shears = int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         obj.save()
#         julydata["J-Last Month Shears"].append(D.Last_month_shears)
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(julydata)
#     sf = df.to_csv("App/Saved/July.csv", index=False)
#     return sf, julydata
#
# def August_():
#     # Retrieve all objects from the model
#     AugData = August.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     augdata = {
#         "A-Members": [],
#         "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#         "J-Last Month Shears": [],
#     }
#
#     for D in AugData:
#         augdata["A-Members"].append(D.firstname)
#         augdata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         augdata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         augdata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         augdata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         augdata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         augdata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         augdata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         augdata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         obj = September.objects.get(firstname=D.firstname)
#         obj.Last_month_shears = int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         obj.save()
#         augdata["J-Last Month Shears"].append(D.Last_month_shears)
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(augdata)
#     sf = df.to_csv("App/Saved/August.csv", index=False)
#     return sf, augdata
#
# def September_():
#     # Retrieve all objects from the model
#     SepData = September.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     sepdata = {
#         "A-Members": [],
#         "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#         "J-Last Month Shears": [],
#     }
#
#     for D in SepData:
#         sepdata["A-Members"].append(D.firstname)
#         sepdata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         sepdata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         sepdata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         sepdata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         sepdata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         sepdata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         sepdata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         sepdata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         obj = October.objects.get(firstname=D.firstname)
#         obj.Last_month_shears = int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         obj.save()
#         sepdata["J-Last Month Shears"].append(D.Last_month_shears)
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(sepdata)
#     sf = df.to_csv("App/Saved/September.csv", index=False)
#     return sf, sepdata
#
# def October_():
#     # Retrieve all objects from the model
#     OctData = October.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     octdata = {
#         "A-Members": [],
#         "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#         "J-Last Month Shears": [],
#     }
#
#     for D in OctData:
#         octdata["A-Members"].append(D.firstname)
#         octdata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         octdata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         octdata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         octdata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         octdata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         octdata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         octdata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         octdata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         obj = November.objects.get(firstname=D.firstname)
#         obj.Last_month_shears = int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         obj.save()
#         octdata["J-Last Month Shears"].append(D.Last_month_shears)
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(octdata)
#     sf = df.to_csv("App/Saved/October.csv", index=False)
#     return sf, octdata
#
# def November_():
#     # Retrieve all objects from the model
#     NovData = November.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     novdata = {
#         "A-Members": [],
#         "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#         "J-Last Month Shears": [],
#     }
#
#     for D in NovData:
#         novdata["A-Members"].append(D.firstname)
#         novdata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         novdata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         novdata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         novdata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         novdata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         novdata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         novdata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         novdata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         obj = December.objects.get(firstname=D.firstname)
#         obj.Last_month_shears = int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         obj.save()
#         novdata["J-Last Month Shears"].append(D.Last_month_shears)
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(novdata)
#     sf = df.to_csv("App/Saved/November.csv", index=False)
#     return sf, novdata
#
# def December_():
#     # Retrieve all objects from the model
#     DecData = December.objects.all()
#
#     # Prepare Jan_data for the DataFrame
#     decdata = {
#         "A-Members": [],
#         "I-Total shears": [],
#         "B-Monthly shears": [],
#         "C-Installment": [],
#         "E-Intrest": [],
#         "G-Total amount": [],
#         "D-Outstanding Loan": [],
#         "F-Deposited Amount": [],
#         "H-Balance Loan": [],
#         "J-Last Month Shears": [],
#     }
#
#     for D in DecData:
#         decdata["A-Members"].append(D.firstname)
#         decdata["B-Monthly shears"].append(D.Monthly_shears if D.Monthly_shears is not None else 0)
#         decdata["C-Installment"].append(D.Installment if D.Installment is not None else 0)
#         decdata["D-Outstanding Loan"].append(D.Outstanding_Loan if D.Outstanding_Loan is not None else 0)
#         decdata["E-Intrest"].append(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan))))
#         decdata["F-Deposited Amount"].append(int((0 if D.Monthly_shears is None else D.Monthly_shears)) + int((0 if D.Installment is None else D.Installment)) + int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         decdata["G-Total amount"].append(int(0 if D.Monthly_shears is None else D.Monthly_shears)+int(0 if D.Installment is None else D.Installment)+int(0 if D.Outstanding_Loan is None else int(1/100*(int(D.Outstanding_Loan)))))
#         decdata["H-Balance Loan"].append(int(0 if D.Outstanding_Loan is None else D.Outstanding_Loan) - int(0 if D.Installment is None else D.Installment))
#         decdata["I-Total shears"].append(int(0 if D.Last_month_shears is None else D.Last_month_shears) + int(D.Monthly_shears if D.Monthly_shears is not None else 0))
#         decdata["J-Last Month Shears"].append(D.Last_month_shears)
#
#     # Create and return the DataFrame
#     df = pd.DataFrame(decdata)
#     sf = df.to_csv("App/Saved/December.csv", index=False)
#     return sf